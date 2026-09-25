/**
 * Единая точка «вариант + набор ошибок → решение».
 * Ошибка Ix_from_P требует знать P на входе в трансформатор — это значение
 * берётся из ПРАВИЛЬНОГО решения (двухпроходная схема).
 */
import { buildNetwork } from './network.js';
import { solveRegime } from './solver.js';

/**
 * @param {object} variant
 * @param {{faults?:object, tol?:number, maxIter?:number}} [opts]
 * @returns {{net, sol}}
 */
export function solveVariant(variant, { faults = {}, tol, maxIter } = {}) {
  const ctx = {};
  if (faults.Ix_from_P && variant.type === 'A') {
    const base = buildNetwork(variant);
    const s = solveRegime(base, { tol, maxIter });
    const last = s.iterations.at(-1);
    const iT = base.branches.findIndex((b) => b.kind === 'transformer');
    ctx.P = last.branches[iT].S_in.P;
  }
  const net = buildNetwork(variant, faults, ctx);
  const sol = solveRegime(net, { tol, maxIter, faults });
  return { net, sol };
}
