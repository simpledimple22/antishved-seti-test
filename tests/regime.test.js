import test from 'node:test';
import assert from 'node:assert/strict';
import * as r from '../calc/regime.js';
import { expectClose } from './helpers.js';

test('dS = (P²+Q²)/U²·(R+jX): квадраты и в числителе, и в знаменателе', () => {
  const s = r.dS(42, 30.98, 220, 3.94, 17.38);
  expectClose(s.P, ((42 ** 2 + 30.98 ** 2) / 220 ** 2) * 3.94, { pct: 1e-9 });
  expectClose(s.P, 0.22, { pct: 1 });
  expectClose(s.Q, 0.98, { pct: 1 });
});

test('РАЗМЕРНОСТЬ: при МВт/Мвар/кВ/Ом потери сразу в МВт (физический расчёт в А и В)', () => {
  // P = 100 МВт, Q = 0, U = 100 кВ, R = 10 Ом. Физика: I = P/(√3·U), ΔP = 3·I²·R.
  const P_W = 100e6, U_V = 100e3, R = 10;
  const I = P_W / (Math.sqrt(3) * U_V);
  const dP_MW_phys = (3 * I * I * R) / 1e6;
  const s = r.dS(100, 0, 100, R, 0);
  expectClose(s.P, dP_MW_phys, { pct: 1e-6 });
});

test('РАЗМЕРНОСТЬ: Q_c = U²·B/2 сразу в Мвар (кВ² · См = МВА)', () => {
  // U = 220 кВ, B/2 = 220 мкСм. Физика: Q = U_л² · ω C = U² · b  (U в В, b в См) → Вар.
  const U_V = 220e3, b = 220e-6;
  const Q_var = U_V * U_V * b;
  expectClose(r.Qc(220, 220e-6), Q_var / 1e6, { pct: 1e-6 });
  expectClose(r.Qc(220, 220e-6), 10.65, { pct: 1 });
});

test('масштаб: ΔS ∝ 1/U², ∝ R; Q_c ∝ U²', () => {
  const a = r.dS(40, 20, 110, 5, 10), b = r.dS(40, 20, 220, 5, 10), c = r.dS(40, 20, 110, 10, 20);
  expectClose(a.P / b.P, 4, { pct: 1e-9 });
  expectClose(c.Q / a.Q, 2, { pct: 1e-9 });
  expectClose(r.Qc(440, 1e-4) / r.Qc(220, 1e-4), 4, { pct: 1e-9 });
});

test('dU = (P·R+Q·X)/U, δU = (P·X−Q·R)/U и модуль напряжения (эталонная точка 218 кВ)', () => {
  const du = r.dU(41.49, 34.7, 2.81, 76.04, 218);
  const dd = r.deltaU(41.49, 34.7, 2.81, 76.04, 218);
  expectClose(du, (41.49 * 2.81 + 34.7 * 76.04) / 218, { pct: 1e-9 });
  expectClose(dd, (41.49 * 76.04 - 34.7 * 2.81) / 218, { pct: 1e-9 });
  expectClose(r.voltageModulus(218, du, dd), 231.1, { pct: 0.1 });
});

test('U_нн = 218·11/230 ≈ 10.43 кВ', () => {
  expectClose(r.nnVoltage(218, 230, 11), 10.43, { pct: 0.1 });
});

// ── ошибки студента ──
test('faults: missing_U_square даёт «физически невозможные» потери', () => {
  const s = r.dS(42, 30.98, 220, 3.94, 17.38, { missing_U_square: true });
  assert.ok(s.P > 40, `ΔP = ${s.P} — больше передаваемой мощности`);
});
test('faults: missing_PQ_square', () => {
  const s = r.dS(42, 30.98, 220, 3.94, 17.38, { missing_PQ_square: true });
  expectClose(s.P, ((42 + 30.98) / 220 ** 2) * 3.94, { pct: 1e-9 });
});
test('faults: Qc_no_half удваивает зарядную мощность', () => {
  expectClose(r.Qc(220, 220e-6, { Qc_no_half: true }), 2 * r.Qc(220, 220e-6), { pct: 1e-9 });
});
test('faults: dU_deltaU_swap меняет составляющие местами', () => {
  const a = r.dU(40, 30, 2, 20, 220), b = r.deltaU(40, 30, 2, 20, 220);
  assert.equal(r.dU(40, 30, 2, 20, 220, { dU_deltaU_swap: true }), b);
  assert.equal(r.deltaU(40, 30, 2, 20, 220, { dU_deltaU_swap: true }), a);
});
test('faults: no_transverse — приближение, занижает на δU²/(2U)', () => {
  const du = 12.64, dd = 14.03;
  const exact = r.voltageModulus(218, du, dd), approx = r.voltageModulus(218, du, dd, { no_transverse: true });
  assert.equal(approx, 218 + du);
  assert.ok(exact > approx);
  expectClose(exact - approx, dd ** 2 / (2 * (218 + du)), { pct: 5 }); // разложение sqrt
  assert.ok(exact - approx < 1, 'на 220 кВ разница — доли кВ');
});
test('faults: nn_no_ratio', () => {
  assert.equal(r.nnVoltage(218, 230, 11, { nn_no_ratio: true }), 218);
});
