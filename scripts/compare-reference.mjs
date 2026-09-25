// Сравнение расчёта движка с эталоном km2_reference (§2 ТЗ). Запуск: npm run compare
import { readFileSync } from 'node:fs';
import { buildNetwork } from '../calc/network.js';
import { solveRegime } from '../calc/solver.js';
import { nnVoltage } from '../calc/regime.js';

const fx = JSON.parse(readFileSync(new URL('../fixtures/km2_reference.json', import.meta.url), 'utf8'));
const net = buildNetwork(fx.variant);
const sol = solveRegime(net);
const pad = (s, n) => String(s).padStart(n);
const line = (label, exp, act, d = 2) => {
  const dev = exp === 0 ? 0 : ((act - exp) / Math.abs(exp)) * 100;
  return `${label.padEnd(26)} ${pad(exp.toFixed(d), 9)} ${pad(act.toFixed(d), 9)} ${pad((dev >= 0 ? '+' : '') + dev.toFixed(2) + '%', 9)}`;
};

console.log('ПАРАМЕТРЫ СХЕМЫ ЗАМЕЩЕНИЯ          эталон    движок   откл.');
const { lines: [L], transformer: T, S_start } = net.meta;
const p = fx.expected.params;
console.log(line('lg(D/r)', p.lg_ratio, L.lg, 3));
console.log(line('x0, Ом/км', p.x0, L.x0, 3));
console.log(line('b0, 1e-6 См/км', p.b0 * 1e6, L.b0 * 1e6, 3));
console.log(line('R_line, Ом', p.R_line, L.R));
console.log(line('X_line, Ом', p.X_line, L.X));
console.log(line('B/2, мкСм', p.B_half * 1e6, L.B_half * 1e6, 1));
console.log(line('R_T, Ом', p.R_T, T.R));
console.log(line('X_T, Ом', p.X_T, T.X));
console.log(line('dP_x, МВт', p.dP_x_total, T.dP_x));
console.log(line('dQ_x, Мвар', p.dQ_x_total, T.dQ_x));
console.log(line('Q1, Мвар', p.Q1, S_start.Q));

console.log('\nТАБЛИЦА СХОДИМОСТИ                 эталон    движок   откл.');
fx.expected.iterations.forEach((e, i) => {
  const it = sol.iterations[i];
  console.log(`— итерация ${i + 1}`);
  console.log(line('  Q_c1, Мвар', e.Qc1, it.nodes[0].Qc));
  console.log(line('  ΔP_л, МВт', e.dS_line.P, it.branches[0].dS.P));
  console.log(line('  ΔQ_л, Мвар', e.dS_line.Q, it.branches[0].dS.Q));
  console.log(line('  Q_c2, Мвар', e.Qc2, it.nodes[1].Qc));
  console.log(line('  ΔP_T, МВт', e.dS_T.P, it.branches[1].dS.P));
  console.log(line('  ΔQ_T, Мвар', e.dS_T.Q, it.branches[1].dS.Q));
  console.log(line('  P₂, МВт', e.S2.P, it.S_end.P));
  console.log(line('  Q₂, Мвар', e.S2.Q, it.S_end.Q));
  console.log(line('  U₂, кВ', e.U2, it.U[1], 1));
  console.log(line('  U₁, кВ', e.U1, it.U[0], 1));
});

const r = fx.expected.result, t = fx.variant.transformer;
console.log('\nИТОГ');
console.log(line('U1, кВ', r.U1, sol.result.U[0], 1));
console.log(line('U2, кВ', r.U2, sol.result.U[1], 1));
console.log(line('P2, МВт', r.S2.P, sol.result.S_end.P));
console.log(line('Q2, Мвар', r.S2.Q, sol.result.S_end.Q));
console.log(line('U_нн, кВ', r.U_nn, nnVoltage(fx.variant.U_end, t.Uvn, t.Unn)));
console.log(line('ΣΔP, МВт', r.loss_total_P, sol.result.loss_total_P));
console.log(line('ΣΔP, % от P1', r.loss_total_pct, sol.result.loss_total_pct));
console.log(`\nСошлось: ${sol.converged}, итераций: ${sol.iterations.length}, последний max|ΔU| = ${sol.iterations.at(-1).maxDelta.toFixed(4)} кВ`);
