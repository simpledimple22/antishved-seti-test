import test from 'node:test';
import assert from 'node:assert/strict';
import * as p from '../calc/params.js';
import { expectClose } from './helpers.js';

// Эталонные входные данные (АС 300/39, D=8 м, d=24 мм, L=82 км, 2 цепи; 2×ТРДН-40000/220)
const D = 8000, r = 12; // мм

test('lgRatio: lg(D/r) при r = 12 мм равен 2.824', () => {
  expectClose(p.lgRatio(D, r), 2.824, { pct: 0.1 });
});

test('x0 = 0.1445·lg(D/r) + 0.0157 → 0.424 Ом/км', () => {
  expectClose(p.x0(D, r), 0.424, { pct: 1 });
  assert.ok(Math.abs(p.x0(D, r) - (0.1445 * Math.log10(D / r) + 0.0157)) < 1e-12);
});

test('b0 = 7.58e-6 / lg(D/r) → 2.684e-6 См/км', () => {
  expectClose(p.b0(D, r), 2.684e-6, { pct: 1 });
});

test('единицы D и r: важно только отношение (мм/мм = м/м)', () => {
  assert.ok(Math.abs(p.x0(8, 0.012) - p.x0(8000, 12)) < 1e-12);
});

test('R_line, X_line делятся на число цепей, B_line — умножается', () => {
  const x = p.x0(D, r), b = p.b0(D, r);
  expectClose(p.R_line(0.096, 82, 2), 3.94, { pct: 1 });
  expectClose(p.X_line(x, 82, 2), 17.38, { pct: 1 });
  expectClose(p.B_line(b, 82, 2) / 2, 220e-6, { pct: 1 });
  // одна цепь → без деления, B без умножения
  assert.equal(p.R_line(0.096, 82, 1), 0.096 * 82);
  assert.equal(p.B_line(b, 82, 1), b * 82);
  // n=3: R втрое меньше, B втрое больше
  assert.ok(Math.abs(p.R_line(0.1, 100, 3) - 10 / 3) < 1e-12);
});

test('R_T = ΔP_к·U²/S²/n → 2.81 Ом (ΔP_к в МВт!)', () => {
  expectClose(p.R_T(0.170, 230, 40, 2), 2.81, { pct: 1 });
});

test('X_T = u_к·U²/(100·S)/n → 76.04 Ом', () => {
  expectClose(p.X_T(11.5, 230, 40, 2), 76.04, { pct: 1 });
});

test('потери х.х.: ΔP_x = n·ΔP_x1 = 0.10 МВт; ΔQ_x = n·I_x·S_ном/100 = 0.72 Мвар', () => {
  expectClose(p.dP_x_total(0.050, 2), 0.10, { pct: 1 });
  expectClose(p.dQ_x_total(0.9, 40, 2), 0.72, { pct: 1 });
});

test('ΔQ_x берётся от ПОЛНОЙ S_ном, а не от активной мощности', () => {
  assert.notEqual(p.dQ_x_total(0.9, 40, 2, { Ix_from_P: true }, { P: 30 }), p.dQ_x_total(0.9, 40, 2));
  assert.equal(p.dQ_x_total(0.9, 40, 2, { Ix_from_P: true }, { P: 30 }), 2 * 0.9 * 30 / 100);
});

test('масштабирование: R_T ∝ U²/S², X_T ∝ U²/S (проверка размерностей)', () => {
  const R1 = p.R_T(0.17, 230, 40, 1), R2 = p.R_T(0.17, 460, 40, 1);
  assert.ok(Math.abs(R2 / R1 - 4) < 1e-9); // U×2 → R×4
  const R3 = p.R_T(0.17, 230, 80, 1);
  assert.ok(Math.abs(R1 / R3 - 4) < 1e-9); // S×2 → R/4
  const X1 = p.X_T(11.5, 230, 40, 1), X3 = p.X_T(11.5, 230, 80, 1);
  assert.ok(Math.abs(X1 / X3 - 2) < 1e-9); // S×2 → X/2
});

// ── «ошибки студента» дают именно те искажения, которые описаны ──
test('faults: log_ln, radius_diameter, unit_mismatch', () => {
  assert.equal(p.lgRatio(D, r, { log_ln: true }), Math.log(D / r));
  const g = p.wireGeometry({ d_mm: 24, D_m: 8 }, { radius_diameter: true });
  assert.deepEqual(g, { D: 8000, r: 24 });
  const g2 = p.wireGeometry({ d_mm: 24, D_m: 8 }, { unit_mismatch: true });
  assert.deepEqual(g2, { D: 8, r: 12 });
  assert.ok(p.x0(g2.D, g2.r) < 0.02); // lg(8/12) < 0 → x0 почти нулевое/отрицательное
});

test('faults: параллельные элементы', () => {
  assert.equal(p.R_line(0.096, 82, 2, { no_parallel_div: true }), 0.096 * 82);
  assert.equal(p.R_line(0.096, 82, 2, { parallel_mult: true }), 0.096 * 82 * 2);
  expectClose(p.B_line(1e-6, 10, 2, { wrong_B_div: true }), 5e-6, { pct: 1e-9 });
  assert.equal(p.dP_x_total(0.05, 2, { wrong_px_div: true }), 0.025);
});

test('faults: R_T / X_T', () => {
  assert.ok(Math.abs(p.R_T(0.17, 230, 40, 2, { RT_no_square: true }) - (0.17 * 230) / 40 / 2) < 1e-12);
  assert.ok(Math.abs(p.X_T(11.5, 230, 40, 2, { XT_no_100: true }) - p.X_T(11.5, 230, 40, 2) * 100) < 1e-9);
  const wrongU = p.X_T(11.5, 230, 40, 2, { XT_wrong_U: true }, { U_nom: 220 });
  expectClose(wrongU, p.X_T(11.5, 220, 40, 2), { pct: 1e-9 });
});
