/**
 * Итерационный решатель режима: «мощности вперёд — напряжения назад».
 *
 *   Инициализация: все напряжения = номинальному (в конечном узле — заданное).
 *   Прямой ход (источник → нагрузка), напряжения — с ПРЕДЫДУЩЕЙ итерации:
 *     в каждом узле:  S += jQ_c − (ΔP_x + jΔQ_x) − S_нагрузки
 *     в каждой ветви: S −= ΔS,  ΔS = (P²+Q²)/U²·(R+jX),  U — напряжение
 *                      узла, из которого ветвь начинается.
 *   Обратный ход (нагрузка → источник): от известного U_конец по каждой ветви
 *     U_начала = sqrt((U_конца+dU)² + δU²),  P,Q — в конце ветви.
 *   Сходимость: max|U_k − U_k−1| < tol (по умолчанию 0.01 кВ).
 *
 * Решатель ничего не знает про «тип A/B» — только про узлы и ветви.
 * Возвращает ПОЛНЫЙ журнал итераций: из него строится пошаговый разбор и
 * таблица сходимости в UI.
 */
import { Qc, dS, dU, deltaU, voltageModulus } from './regime.js';

/**
 * @param {{nodes, branches, boundary}} net
 * @param {{tol?:number, maxIter?:number, faults?:object}} [opts]
 * @returns {{converged:boolean, iterations:object[], result:object}}
 */
export function solveRegime(net, { tol = 0.01, maxIter = 50, faults = {} } = {}) {
  const N = net.nodes.length;
  const M = net.branches.length;
  const { S_start, U_end } = net.boundary;

  let U = net.nodes.map((n) => n.U_nom);
  U[N - 1] = U_end;

  const iterations = [];
  let converged = false;

  for (let it = 1; it <= maxIter; it++) {
    const Uprev = U.slice();

    // ── прямой ход: мощности ──
    let P = S_start.P;
    let Q = S_start.Q;
    const nodeLog = [];
    const branchLog = [];
    for (let k = 0; k < N; k++) {
      const nd = net.nodes[k];
      const qc = Qc(Uprev[k], nd.shunt.B_half, faults);
      const sign = faults.Qc_sign ? -1 : 1; // ошибка: зарядная мощность вычтена
      const load = nd.load ?? { P: 0, Q: 0 };
      P += -nd.shunt.dP_x - load.P;
      Q += sign * qc - nd.shunt.dQ_x - load.Q;
      nodeLog.push({
        id: nd.id,
        U_prev: Uprev[k],
        Qc: qc,
        dP_x: nd.shunt.dP_x,
        dQ_x: nd.shunt.dQ_x,
        load: nd.load,
        S_after: { P, Q }, // мощность, уходящая в ветвь после учёта узла
      });
      if (k < M) {
        const br = net.branches[k];
        // wrong_U_node: потери посчитаны при напряжении НЕ того узла
        const Uloss = faults.wrong_U_node ? Uprev[k + 1] : Uprev[k];
        const loss = dS(P, Q, Uloss, br.R, br.X, faults);
        const sgn = faults.direction_sign ? +1 : -1; // ошибка: потери прибавлены
        const S_in = { P, Q };
        P += sgn * loss.P;
        Q += sgn * loss.Q;
        branchLog.push({ id: br.id, kind: br.kind, R: br.R, X: br.X, U_loss: Uloss, S_in, dS: loss, S_out: { P, Q } });
      }
    }
    const S_end = { P, Q };

    // ── обратный ход: напряжения ──
    const Unew = Uprev.slice();
    Unew[N - 1] = U_end;
    for (let k = M - 1; k >= 0; k--) {
      const br = net.branches[k];
      const { S_out } = branchLog[k];
      const Uto = Unew[k + 1];
      const du = dU(S_out.P, S_out.Q, br.R, br.X, Uto, faults);
      const dd = deltaU(S_out.P, S_out.Q, br.R, br.X, Uto, faults);
      Unew[k] = voltageModulus(Uto, du, dd, faults);
      Object.assign(branchLog[k], { dU: du, deltaU: dd, U_to: Uto, U_from: Unew[k] });
    }

    let maxDelta = 0;
    for (let k = 0; k < N - 1; k++) maxDelta = Math.max(maxDelta, Math.abs(Unew[k] - Uprev[k]));

    iterations.push({ iter: it, U_prev: Uprev, nodes: nodeLog, branches: branchLog, S_end, U: Unew.slice(), maxDelta });
    U = Unew;
    if (!Number.isFinite(maxDelta)) break; // расходимость (может случиться при «ошибочных» формулах)
    if (maxDelta < tol) {
      converged = true;
      break;
    }
  }

  const last = iterations[iterations.length - 1];
  const P_loss_lines = last.branches.reduce((s, b) => s + b.dS.P, 0);
  const P_loss_x = last.nodes.reduce((s, n) => s + n.dP_x, 0);
  const result = {
    U: last.U,
    U_start: last.U[0],
    S_end: last.S_end,
    loss_branches_P: P_loss_lines,
    loss_x_P: P_loss_x,
    loss_total_P: P_loss_lines + P_loss_x,
    loss_total_pct: ((P_loss_lines + P_loss_x) / S_start.P) * 100,
  };
  return { converged, iterations, result };
}
