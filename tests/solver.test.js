import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNetwork } from '../calc/network.js';
import { solveRegime } from '../calc/solver.js';
import { dU, deltaU, voltageModulus, dS } from '../calc/regime.js';
import { nnVoltage } from '../calc/regime.js';
import { expectClose, loadJson } from './helpers.js';

const fx = loadJson('fixtures/km2_reference.json');
const tolPct = fx.tolerance_pct;
const FLOOR = 0.006; // половина последнего разряда таблицы (два знака)

test('km2_reference: параметры схемы замещения (±1 %)', () => {
  const { meta } = buildNetwork(fx.variant);
  const e = fx.expected.params, L = meta.lines[0], T = meta.transformer;
  expectClose(L.lg, e.lg_ratio, { pct: tolPct, label: 'lg' });
  expectClose(L.x0, e.x0, { pct: tolPct, label: 'x0' });
  expectClose(L.b0, e.b0, { pct: tolPct, label: 'b0' });
  expectClose(L.R, e.R_line, { pct: tolPct, label: 'R_line' });
  expectClose(L.X, e.X_line, { pct: tolPct, label: 'X_line' });
  expectClose(L.B_half, e.B_half, { pct: tolPct, label: 'B/2' });
  expectClose(T.R, e.R_T, { pct: tolPct, label: 'R_T' });
  expectClose(T.X, e.X_T, { pct: tolPct, label: 'X_T' });
  expectClose(T.dP_x, e.dP_x_total, { pct: tolPct, label: 'dP_x' });
  expectClose(T.dQ_x, e.dQ_x_total, { pct: tolPct, label: 'dQ_x' });
  expectClose(meta.S_start.Q, e.Q1, { pct: tolPct, label: 'Q1' });
});

test('km2_reference: таблица сходимости — все промежуточные значения трёх итераций', () => {
  const net = buildNetwork(fx.variant);
  const { iterations } = solveRegime(net);
  fx.expected.iterations.forEach((exp, i) => {
    const it = iterations[i], tag = `итер.${i + 1}`;
    const c = (a, b, l, floor = 0) => expectClose(a, b, { pct: tolPct, floor, label: `${tag} ${l}` });
    c(it.nodes[0].Qc, exp.Qc1, 'Qc1', FLOOR);
    c(it.branches[0].dS.P, exp.dS_line.P, 'ΔP_line', FLOOR);
    c(it.branches[0].dS.Q, exp.dS_line.Q, 'ΔQ_line', FLOOR);
    c(it.nodes[1].Qc, exp.Qc2, 'Qc2', FLOOR);
    c(it.branches[1].dS.P, exp.dS_T.P, 'ΔP_T', FLOOR);
    c(it.branches[1].dS.Q, exp.dS_T.Q, 'ΔQ_T', FLOOR);
    c(it.S_end.P, exp.S2.P, 'P2', FLOOR);
    c(it.S_end.Q, exp.S2.Q, 'Q2', FLOOR);
    c(it.U[1], exp.U2, 'U2');
    c(it.U[0], exp.U1, 'U1');
  });
});

test('km2_reference: итоговые значения, потери и U_нн', () => {
  const net = buildNetwork(fx.variant);
  const { converged, result } = solveRegime(net);
  const e = fx.expected.result;
  assert.ok(converged);
  expectClose(result.U[0], e.U1, { pct: tolPct });
  expectClose(result.U[1], e.U2, { pct: tolPct });
  expectClose(result.S_end.P, e.S2.P, { pct: tolPct });
  expectClose(result.S_end.Q, e.S2.Q, { pct: tolPct });
  const t = fx.variant.transformer;
  expectClose(nnVoltage(fx.variant.U_end, t.Uvn, t.Unn), e.U_nn, { pct: tolPct });
  expectClose(result.loss_total_P, e.loss_total_P, { pct: tolPct, floor: FLOOR });
  expectClose(result.loss_total_pct, e.loss_total_pct, { pct: 5 }); // «≈ 1.2 %» — округлено в таблице
});

test('журнал итераций полный: узлы, ветви, напряжения, критерий', () => {
  const { iterations } = solveRegime(buildNetwork(fx.variant));
  const it = iterations[0];
  assert.equal(it.iter, 1);
  assert.equal(it.nodes.length, 3);
  assert.equal(it.branches.length, 2);
  for (const b of it.branches) {
    for (const k of ['S_in', 'dS', 'S_out', 'dU', 'deltaU', 'U_to', 'U_from']) assert.ok(k in b, `нет ${k}`);
  }
  for (const k of ['Qc', 'dP_x', 'dQ_x', 'S_after', 'U_prev']) assert.ok(k in it.nodes[1], `нет ${k}`);
  assert.equal(it.U_prev[0], 220, 'итерация 1 стартует с номинального напряжения');
  assert.ok(Number.isFinite(it.maxDelta));
});

test('сходимость: maxDelta убывает, итераций немного, критерий tol работает', () => {
  const s = solveRegime(buildNetwork(fx.variant));
  assert.ok(s.converged);
  assert.ok(s.iterations.length <= 6, `итераций: ${s.iterations.length}`);
  const d = s.iterations.map((i) => i.maxDelta);
  for (let i = 1; i < d.length; i++) assert.ok(d[i] < d[i - 1]);
  assert.ok(d[d.length - 1] < 0.01);
  const loose = solveRegime(buildNetwork(fx.variant), { tol: 1 });
  assert.ok(loose.iterations.length < s.iterations.length);
  const capped = solveRegime(buildNetwork(fx.variant), { maxIter: 2 });
  assert.equal(capped.iterations.length, 2);
  assert.equal(capped.converged, false);
});

test('баланс мощностей: P_нач − ΣΔP_ветвей − ΔP_х.х. = P_кон', () => {
  const { iterations, result } = solveRegime(buildNetwork(fx.variant));
  const last = iterations.at(-1);
  expectClose(fx.variant.S_start.P - result.loss_total_P, last.S_end.P, { pct: 1e-9 });
});

// ───────────── Тип B: две линии без трансформатора — тем же решателем ─────────────
const variantB = {
  type: 'B',
  U_nom: 220,
  lines: [
    { wire: { name: 'АС 300/39', R0: 0.096, d_mm: 24, D_m: 8 }, L: 60, n: 1 },
    { wire: { name: 'АС 240/32', R0: 0.121, d_mm: 21.6, D_m: 8 }, L: 45, n: 2 },
  ],
  mid_load: { P: 20, tgphi: 0.4 },
  S_start: { P: 45, tgphi: 0.45 },
  U_end: 215,
};

test('тип B: сеть без трансформаторной ветви решается тем же решателем', () => {
  const net = buildNetwork(variantB);
  assert.equal(net.branches.every((b) => b.kind === 'line'), true);
  assert.equal(net.nodes[1].load.P, 20);
  const s = solveRegime(net);
  assert.ok(s.converged);
  assert.ok(s.iterations.length <= 6);
  // B/2 обеих линий сидят в промежуточном узле
  const { meta } = net;
  expectClose(net.nodes[1].shunt.B_half, meta.lines[0].B_half + meta.lines[1].B_half, { pct: 1e-9 });
});

test('тип B: внутренняя согласованность результата (независимая проверка)', () => {
  const net = buildNetwork(variantB);
  const { iterations, result } = solveRegime(net, { tol: 1e-9 });
  const last = iterations.at(-1);
  // 1) каждая ветвь: U_нач восстанавливается из U_кон и потока в конце ветви
  for (const b of last.branches) {
    const du = dU(b.S_out.P, b.S_out.Q, b.R, b.X, b.U_to);
    const dd = deltaU(b.S_out.P, b.S_out.Q, b.R, b.X, b.U_to);
    expectClose(voltageModulus(b.U_to, du, dd), b.U_from, { pct: 1e-6 });
    // 2) потери в ветви пересчитываются при найденном напряжении начала ветви
    const loss = dS(b.S_in.P, b.S_in.Q, b.U_loss, b.R, b.X);
    expectClose(loss.P, b.dS.P, { pct: 1e-6 });
    expectClose(b.S_in.P - b.dS.P, b.S_out.P, { pct: 1e-9 });
  }
  // 3) баланс P: источник − потери − нагрузка узла 2 = конец
  const Pbal = variantB.S_start.P - result.loss_branches_P - variantB.mid_load.P;
  expectClose(Pbal, last.S_end.P, { pct: 1e-9 });
  // 4) напряжение в начале выше, чем в конце (передача P к нагрузке)
  assert.ok(result.U[0] > result.U[2]);
  assert.equal(result.U[2], variantB.U_end);
});

test('тип B: две линии из одного провода 2×L без нагрузки в середине ≡ одной линии 2L', () => {
  const w = { name: 'АС 300/39', R0: 0.096, d_mm: 24, D_m: 8 };
  const split = { type: 'B', U_nom: 220, lines: [{ wire: w, L: 50, n: 1 }, { wire: w, L: 50, n: 1 }], mid_load: { P: 0, tgphi: 0 }, S_start: { P: 30, tgphi: 0.4 }, U_end: 215 };
  const s = solveRegime(buildNetwork(split), { tol: 1e-9 });
  // шунты обоих половин в середине ≠ П-схема одной линии, поэтому сравниваем
  // с допуском на разницу схем замещения (несколько десятых кВ)
  const single = { type: 'A', U_nom: 220, wire: w, L: 100, n_line: 1, transformer: { name: 'нулевой', n: 1, dPk_kW: 0, uk_pct: 0, dPx_kW: 0, Ix_pct: 0, Uvn: 220, Unn: 10, Sn: 100 }, S_start: { P: 30, tgphi: 0.4 }, U_end: 215 };
  const s1 = solveRegime(buildNetwork(single), { tol: 1e-9 });
  assert.ok(Math.abs(s.result.U[0] - s1.result.U[0]) < 0.5, `${s.result.U[0]} vs ${s1.result.U[0]}`);
});
