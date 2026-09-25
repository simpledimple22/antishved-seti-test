import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSteps, attachQuestionIds } from '../calc/steps.js';
import { QUANTITIES, computeQuantity } from '../calc/quantities.js';
import { MISCONCEPTIONS } from '../calc/misconceptions.js';
import { expectClose, loadJson } from './helpers.js';

const fx = loadJson('fixtures/km2_reference.json');
const { steps, solution } = buildSteps(fx.variant);
const byId = Object.fromEntries(steps.map((s) => [s.id, s]));

test('шаг-ноль — «Разбор схемы замещения», про шунты и n цепей/трансформаторов', () => {
  assert.equal(steps[0].id, 'scheme');
  assert.equal(steps[0].title, 'Разбор схемы замещения');
  assert.match(steps[0].why, /поперечн/i);
  assert.match(steps[0].substitution, /делим/);
  assert.match(steps[0].substitution, /умножаем/);
});

test('у каждого шага заполнены id, kind, title, formula, substitution, result, why', () => {
  const ids = new Set();
  for (const s of steps) {
    for (const f of ['id', 'kind', 'title', 'formula', 'substitution', 'why']) assert.ok(s[f] && typeof s[f] === 'string', `${s.id}.${f}`);
    assert.ok(s.result && s.result.text, `${s.id}.result`);
    assert.ok(!ids.has(s.id), `дубль id ${s.id}`);
    ids.add(s.id);
    assert.ok(Array.isArray(s.checks) && Array.isArray(s.check_question_ids));
  }
});

test('порядок: схема → параметры → 3 итерации (прямой ход, затем обратный) → сходимость → U_нн → потери', () => {
  const kinds = steps.map((s) => s.kind);
  assert.equal(kinds[0], 'scheme');
  assert.ok(kinds.indexOf('R_line') < kinds.indexOf('R_T'));
  assert.ok(kinds.indexOf('Q1') < kinds.findIndex((k) => k === 'Qc'));
  assert.deepEqual(kinds.slice(-3), ['convergence', 'U_nn', 'losses']);
  // итерация 1: Q_c1 → ΔS_л → Q_c2 → ΔS_T → S → (обратный) dU_T → U₂ → dU_л → U₁
  const it1 = steps.filter((s) => s.id.startsWith('iter1.')).map((s) => s.id);
  assert.deepEqual(it1, ['iter1.Qc.n1', 'iter1.dS.b1', 'iter1.Qc.n2', 'iter1.dS.b2', 'iter1.S_end', 'iter1.dU.b2', 'iter1.U.n2', 'iter1.dU.b1', 'iter1.U.n1']);
});

test('числа в разбор берутся из журнала решателя: совпадают с эталонной таблицей', () => {
  fx.expected.iterations.forEach((e, i) => {
    const n = i + 1;
    expectClose(byId[`iter${n}.Qc.n1`].result.value, e.Qc1, { pct: 1, floor: 0.006 });
    expectClose(byId[`iter${n}.dS.b1`].result.value, e.dS_line.P, { pct: 1, floor: 0.006 });
    expectClose(byId[`iter${n}.S_end`].result.value, e.S2.P, { pct: 1, floor: 0.006 });
    expectClose(byId[`iter${n}.U.n2`].result.value, e.U2, { pct: 1 });
    expectClose(byId[`iter${n}.U.n1`].result.value, e.U1, { pct: 1 });
  });
  expectClose(byId.U_nn.result.value, fx.expected.result.U_nn, { pct: 1 });
});

test('checks шагов ссылаются на существующие величины и согласованы с расчётом', () => {
  for (const s of steps) {
    for (const c of s.checks) {
      assert.ok(QUANTITIES[c.quantity], `${s.id}: нет величины ${c.quantity}`);
      const v = computeQuantity(fx.variant, c.quantity, { iteration: c.iteration ?? 1 });
      assert.ok(Number.isFinite(v), `${s.id}/${c.quantity}`);
    }
  }
  // для шагов с одной проверяемой величиной значение шага = значение величины (в единицах шага)
  for (const id of ['R_line', 'X_line', 'R_T', 'X_T', 'dQ_x_total', 'iter2.Qc.n2', 'iter3.U.n1']) {
    const s = byId[id], c = s.checks[0];
    const v = computeQuantity(fx.variant, c.quantity, { iteration: c.iteration ?? 1 });
    const stepVal = c.quantity === 'B_half' ? s.result.value * 1e6 : s.result.value;
    expectClose(stepVal, v, { pct: 1e-6, label: id });
  }
});

test('«типовая ошибка» шага берётся из реестра и содержит ключи', () => {
  assert.ok(byId.R_T.pitfall_keys.includes('RT_no_square'));
  assert.ok(byId['iter1.dS.b1'].pitfall_keys.includes('missing_U_square'));
  assert.ok(byId['iter1.U.n2'].pitfall_keys.includes('no_transverse'));
  for (const s of steps) for (const k of s.pitfall_keys) assert.ok(MISCONCEPTIONS[k]);
  assert.match(byId.R_T.pitfall, /квадрат/i);
});

test('attachQuestionIds: шаг получает id вопросов по related_step', () => {
  const qs = [{ id: 'a', related_step: 'R_T' }, { id: 'b', related_step: 'R_T' }, { id: 'c', related_step: 'x0' }];
  const st = attachQuestionIds(buildSteps(fx.variant).steps, qs);
  assert.deepEqual(st.find((s) => s.id === 'R_T').check_question_ids, ['a', 'b']);
  assert.deepEqual(st.find((s) => s.id === 'x0').check_question_ids, ['c']);
});

test('тип B: разбор строится тем же кодом, без шагов трансформатора', () => {
  const vB = {
    type: 'B', U_nom: 220,
    lines: [{ wire: { name: 'АС 300/39', R0: 0.096, d_mm: 24, D_m: 8 }, L: 60, n: 1 }, { wire: { name: 'АС 240/32', R0: 0.121, d_mm: 21.6, D_m: 8 }, L: 45, n: 2 }],
    mid_load: { P: 20, tgphi: 0.4 }, S_start: { P: 45, tgphi: 0.45 }, U_end: 215,
  };
  const r = buildSteps(vB);
  const kinds = new Set(r.steps.map((s) => s.kind));
  assert.ok(!kinds.has('R_T') && !kinds.has('U_nn') && !kinds.has('dS_T'));
  assert.ok(r.steps.some((s) => s.id === 'R_line_2'));
  assert.ok(r.steps.some((s) => s.id === 'iter1.Qc.n3'), 'B/2 в конечном узле тоже даёт Q_c');
  assert.equal(r.steps[0].id, 'scheme');
});

test('решение из buildSteps совпадает с solveRegime', () => {
  assert.ok(solution.converged);
  expectClose(solution.result.U[0], fx.expected.result.U1, { pct: 1 });
});
