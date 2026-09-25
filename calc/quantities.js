/**
 * Реестр «проверяемых величин» — общий язык для:
 *   • диагностики (diagnose): что студент посчитал;
 *   • банка вопросов (micro_calc, плейсхолдеры в фидбэке);
 *   • пошагового разбора.
 * Значения отдаются в ОТОБРАЖАЕМЫХ единицах (scale уже применён; например
 * B/2 — в мкСм), студент вводит числа в тех же единицах.
 *
 * Допуск: по умолчанию ±2 % (tol.pct). Для напряжений ±2 % — это ±4.6 кВ,
 * что «съело» бы любую ошибку в модуле напряжения, поэтому там абсолютный
 * допуск (tol.abs, кВ) — соответствует округлению до 0.1 кВ.
 */
import { solveVariant } from './run.js';
import { nnVoltage } from './regime.js';

const kindIdx = (net, kind, nth = 0) => {
  let c = 0;
  for (let i = 0; i < net.branches.length; i++) {
    if (net.branches[i].kind === kind) {
      if (c === nth) return i;
      c++;
    }
  }
  return -1;
};

const line = (n = 0) => (r) => r.net.meta.lines[n];
const tr = (r) => r.net.meta.transformer;
const U_TOL = { abs: 0.15 };

/** id → { label, unit, scale, digits, iterative, tol, get(run, itIdx), applies(variant) } */
export const QUANTITIES = {
  // ── параметры схемы замещения (итерации не участвуют) ──
  lg_ratio: { label: 'lg(D_ср/r)', unit: '', digits: 3, get: (r) => line()(r).lg },
  x0: { label: 'x₀', unit: 'Ом/км', digits: 3, get: (r) => line()(r).x0 },
  b0: { label: 'b₀', unit: 'мкСм/км', scale: 1e6, digits: 3, get: (r) => line()(r).b0 },
  R_line: { label: 'R_л', unit: 'Ом', digits: 2, get: (r) => line()(r).R },
  X_line: { label: 'X_л', unit: 'Ом', digits: 2, get: (r) => line()(r).X },
  B_line: { label: 'B_л', unit: 'мкСм', scale: 1e6, digits: 1, get: (r) => line()(r).B },
  B_half: { label: 'B/2', unit: 'мкСм', scale: 1e6, digits: 1, get: (r) => line()(r).B_half },
  R_T: { label: 'R_T', unit: 'Ом', digits: 2, get: (r) => tr(r).R, applies: (v) => v.type === 'A' },
  X_T: { label: 'X_T', unit: 'Ом', digits: 2, get: (r) => tr(r).X, applies: (v) => v.type === 'A' },
  dP_x_total: { label: 'ΔP_x', unit: 'МВт', digits: 3, get: (r) => tr(r).dP_x, applies: (v) => v.type === 'A' },
  dQ_x_total: { label: 'ΔQ_x', unit: 'Мвар', digits: 2, get: (r) => tr(r).dQ_x, applies: (v) => v.type === 'A' },
  Q1: { label: 'Q₁', unit: 'Мвар', digits: 2, get: (r) => r.net.meta.S_start.Q },

  // ── зарядная мощность узлов ──
  Qc1: { label: 'Q_c1', unit: 'Мвар', digits: 2, iterative: true, get: (r, it) => r.sol.iterations[it].nodes[0].Qc },
  Qc2: { label: 'Q_c2', unit: 'Мвар', digits: 2, iterative: true, get: (r, it) => r.sol.iterations[it].nodes[1].Qc },
  Qc3: { label: 'Q_c3', unit: 'Мвар', digits: 2, iterative: true, get: (r, it) => r.sol.iterations[it].nodes[2].Qc },

  // ── потери в ветвях ──
  dS_line_P: { label: 'ΔP_л', unit: 'МВт', digits: 2, iterative: true, get: (r, it) => r.sol.iterations[it].branches[kindIdx(r.net, 'line', 0)].dS.P },
  dS_line_Q: { label: 'ΔQ_л', unit: 'Мвар', digits: 2, iterative: true, get: (r, it) => r.sol.iterations[it].branches[kindIdx(r.net, 'line', 0)].dS.Q },
  dS_line2_P: { label: 'ΔP_л2', unit: 'МВт', digits: 2, iterative: true, get: (r, it) => r.sol.iterations[it].branches[kindIdx(r.net, 'line', 1)].dS.P, applies: (v) => v.type === 'B' },
  dS_line2_Q: { label: 'ΔQ_л2', unit: 'Мвар', digits: 2, iterative: true, get: (r, it) => r.sol.iterations[it].branches[kindIdx(r.net, 'line', 1)].dS.Q, applies: (v) => v.type === 'B' },
  dS_T_P: { label: 'ΔP_T', unit: 'МВт', digits: 2, iterative: true, get: (r, it) => r.sol.iterations[it].branches[kindIdx(r.net, 'transformer')].dS.P, applies: (v) => v.type === 'A' },
  dS_T_Q: { label: 'ΔQ_T', unit: 'Мвар', digits: 2, iterative: true, get: (r, it) => r.sol.iterations[it].branches[kindIdx(r.net, 'transformer')].dS.Q, applies: (v) => v.type === 'A' },

  // ── поток мощности на входе ветви (после учёта узла) ──
  S_line_in_P: { label: 'P на входе линии', unit: 'МВт', digits: 2, iterative: true, get: (r, it) => r.sol.iterations[it].branches[kindIdx(r.net, 'line', 0)].S_in.P },
  S_line_in_Q: { label: 'Q на входе линии', unit: 'Мвар', digits: 2, iterative: true, get: (r, it) => r.sol.iterations[it].branches[kindIdx(r.net, 'line', 0)].S_in.Q },
  S_T_in_P: { label: 'P на входе трансформаторов', unit: 'МВт', digits: 2, iterative: true, get: (r, it) => r.sol.iterations[it].branches[kindIdx(r.net, 'transformer')].S_in.P, applies: (v) => v.type === 'A' },
  S_T_in_Q: { label: 'Q на входе трансформаторов', unit: 'Мвар', digits: 2, iterative: true, get: (r, it) => r.sol.iterations[it].branches[kindIdx(r.net, 'transformer')].S_in.Q, applies: (v) => v.type === 'A' },

  // ── мощность на конце (нагрузка) ──
  S2_P: { label: 'P₂', unit: 'МВт', digits: 2, iterative: true, get: (r, it) => r.sol.iterations[it].S_end.P },
  S2_Q: { label: 'Q₂', unit: 'Мвар', digits: 2, iterative: true, get: (r, it) => r.sol.iterations[it].S_end.Q },

  // ── падения напряжения ──
  dU_line: { label: 'dU_л', unit: 'кВ', digits: 2, iterative: true, tol: { pct: 2 }, get: (r, it) => r.sol.iterations[it].branches[kindIdx(r.net, 'line', 0)].dU },
  deltaU_line: { label: 'δU_л', unit: 'кВ', digits: 2, iterative: true, tol: { pct: 2 }, get: (r, it) => r.sol.iterations[it].branches[kindIdx(r.net, 'line', 0)].deltaU },
  dU_T: { label: 'dU_T', unit: 'кВ', digits: 2, iterative: true, tol: { pct: 2 }, get: (r, it) => r.sol.iterations[it].branches[kindIdx(r.net, 'transformer')].dU, applies: (v) => v.type === 'A' },
  deltaU_T: { label: 'δU_T', unit: 'кВ', digits: 2, iterative: true, tol: { pct: 2 }, get: (r, it) => r.sol.iterations[it].branches[kindIdx(r.net, 'transformer')].deltaU, applies: (v) => v.type === 'A' },

  // ── модули напряжений ──
  U1: { label: 'U₁', unit: 'кВ', digits: 1, iterative: true, tol: U_TOL, get: (r, it) => r.sol.iterations[it].U[0] },
  U2: { label: 'U₂', unit: 'кВ', digits: 1, iterative: true, tol: U_TOL, get: (r, it) => r.sol.iterations[it].U[1] },
  U_nn: {
    label: 'U_нн', unit: 'кВ', digits: 2, tol: { pct: 1 }, applies: (v) => v.type === 'A',
    get: (r, _it, faults) => nnVoltage(r.net.boundary.U_end, tr(r).t.Uvn, tr(r).t.Unn, faults),
  },
  loss_total_P: { label: 'ΣΔP', unit: 'МВт', digits: 2, get: (r) => r.sol.result.loss_total_P },
};

/**
 * К каким видам шагов разбора относится величина (calc/misconceptions.js → kinds).
 * Нужно диагностике: совпадение с ошибкой СВОЕГО шага правдоподобнее, чем с
 * ошибкой из предыдущих шагов, которая просто «протекла» в это число.
 */
export const QUANTITY_KINDS = {
  lg_ratio: ['lg_ratio'], x0: ['x0', 'lg_ratio'], b0: ['b0', 'lg_ratio'],
  R_line: ['R_line'], X_line: ['X_line'], B_line: ['B_line'], B_half: ['B_line'],
  R_T: ['R_T'], X_T: ['X_T'], dP_x_total: ['dP_x_total'], dQ_x_total: ['dQ_x_total'], Q1: [],
  Qc1: ['Qc'], Qc2: ['Qc'], Qc3: ['Qc'],
  dS_line_P: ['dS_line'], dS_line_Q: ['dS_line'], dS_line2_P: ['dS_line'], dS_line2_Q: ['dS_line'],
  dS_T_P: ['dS_T'], dS_T_Q: ['dS_T'],
  S_line_in_P: [], S_line_in_Q: [], S_T_in_P: [], S_T_in_Q: [],
  S2_P: ['S_end'], S2_Q: ['S_end'],
  dU_line: ['dU', 'deltaU'], deltaU_line: ['dU', 'deltaU'], dU_T: ['dU', 'deltaU'], deltaU_T: ['dU', 'deltaU'],
  U1: ['U_modulus'], U2: ['U_modulus'], U_nn: ['U_nn'], loss_total_P: [],
};

export const DEFAULT_TOL = { pct: 2 };

/** Список id величин, применимых к варианту. */
export function applicableQuantities(variant) {
  return Object.keys(QUANTITIES).filter((id) => !QUANTITIES[id].applies || QUANTITIES[id].applies(variant));
}

/** Допуск для величины: { pct } или { abs }. */
export function toleranceFor(qid, override) {
  return override ?? QUANTITIES[qid].tol ?? DEFAULT_TOL;
}

/** |a − b| укладывается в допуск относительно b. */
export function withinTol(a, b, tol) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const lim = tol.abs !== undefined ? tol.abs : (tol.pct / 100) * Math.abs(b);
  return Math.abs(a - b) <= lim;
}

/**
 * Значение величины для варианта (в отображаемых единицах).
 * @param {object} variant
 * @param {string} qid       ключ из QUANTITIES
 * @param {{faults?:object, iteration?:number}} [opts]  iteration — с 1
 * @returns {number} NaN, если величина неприменима или решение «разошлось»
 */
export function computeQuantity(variant, qid, { faults = {}, iteration = 1 } = {}) {
  const q = QUANTITIES[qid];
  if (!q) throw new Error(`Неизвестная величина: ${qid}`);
  if (q.applies && !q.applies(variant)) return NaN;
  const run = solveVariant(variant, { faults, maxIter: q.iterative ? iteration : 1 });
  const idx = Math.min(iteration, run.sol.iterations.length) - 1;
  const raw = q.get(run, q.iterative ? idx : 0, faults);
  return raw * (q.scale ?? 1);
}

/** Число знаков по умолчанию для отображения. */
export const digitsOf = (qid) => QUANTITIES[qid].digits ?? 2;
