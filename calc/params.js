/**
 * Параметры схемы замещения ВЛ и трансформаторов.
 *
 * Система единиц (при ней формулы работают БЕЗ переводных коэффициентов):
 *   P, Q, S — МВт / Мвар / МВА;  U — кВ;  R, X — Ом;  B — См;  ΔP — МВт.
 *
 * Каждая формула принимает необязательный объект `faults` — набор «типовых
 * ошибок студента» (ключи из calc/misconceptions.js). Если ключ включён,
 * функция считает НЕПРАВИЛЬНО, ровно так, как ошибается студент. Так и
 * дистракторы в тестах, и диагностика берут «неправильные» числа из одного
 * и того же места — рядом с правильной формулой.
 */

// ───────────────────────── ВЛ ─────────────────────────

/**
 * lg(D_ср / r)  — безразмерная. D_ср и r ДОЛЖНЫ быть в одних единицах.
 * Формула: lg(D_ср / r)
 * Ошибки: log_ln (натуральный логарифм вместо десятичного).
 */
export function lgRatio(D, r, faults = {}) {
  const q = D / r;
  return faults.log_ln ? Math.log(q) : Math.log10(q);
}

/**
 * Пересчёт паспортных геометрических данных провода к аргументам lg(D/r).
 * Правильно: D_ср (м) → мм, r = d/2 (радиус, не диаметр!), обе в мм.
 * Ошибки: radius_diameter (в знаменателе диаметр), unit_mismatch (D в м, r в мм).
 * @param {{d_mm:number, D_m:number}} wire
 * @returns {{D:number, r:number}}
 */
export function wireGeometry(wire, faults = {}) {
  const r_mm = wire.d_mm / 2;
  if (faults.unit_mismatch) return { D: wire.D_m, r: r_mm };
  if (faults.radius_diameter) return { D: wire.D_m * 1000, r: wire.d_mm };
  return { D: wire.D_m * 1000, r: r_mm };
}

/**
 * Удельное индуктивное сопротивление, Ом/км.
 * Формула: x0 = 0.1445·lg(D_ср/r) + 0.0157
 */
export function x0(D, r, faults = {}) {
  return 0.1445 * lgRatio(D, r, faults) + 0.0157;
}

/**
 * Удельная ёмкостная проводимость, См/км.
 * Формула: b0 = 7.58·10⁻⁶ / lg(D_ср/r)
 */
export function b0(D, r, faults = {}) {
  return 7.58e-6 / lgRatio(D, r, faults);
}

/**
 * Активное сопротивление линии, Ом.  R_line = R0·L / n_ц
 * Ошибки: no_parallel_div (не разделили), parallel_mult (умножили вместо деления).
 */
export function R_line(R0, L, n, faults = {}) {
  if (faults.no_parallel_div) return R0 * L;
  if (faults.parallel_mult) return R0 * L * n;
  return (R0 * L) / n;
}

/** Индуктивное сопротивление линии, Ом.  X_line = x0·L / n_ц */
export function X_line(x0v, L, n, faults = {}) {
  if (faults.no_parallel_div) return x0v * L;
  if (faults.parallel_mult) return x0v * L * n;
  return (x0v * L) / n;
}

/**
 * Ёмкостная проводимость линии, См.  B_line = b0·L·n_ц  (цепи ПАРАЛЛЕЛЬНЫ —
 * проводимости складываются). В П-схеме в каждый конец идёт B_line / 2.
 * Ошибки: wrong_B_div (разделили на n), no_parallel_div (не учли число цепей).
 */
export function B_line(b0v, L, n, faults = {}) {
  if (faults.wrong_B_div) return (b0v * L) / n;
  if (faults.no_parallel_div) return b0v * L;
  return b0v * L * n;
}

// ───────────────────── Трансформаторы (n параллельно) ─────────────────────

/**
 * Активное сопротивление n трансформаторов, Ом.
 *   R_T = ΔP_к · U_вн² / S_ном² / n     (ΔP_к — МВт, U_вн — кВ, S_ном — МВА)
 * Ошибки: RT_no_square (потеряны квадраты), no_parallel_div, parallel_mult.
 * (Ошибка kW_MW — на уровне подстановки ΔP_к, см. calc/network.js.)
 */
export function R_T(dPk_MW, Uvn, Sn, n, faults = {}) {
  const base = faults.RT_no_square ? (dPk_MW * Uvn) / Sn : (dPk_MW * Uvn ** 2) / Sn ** 2;
  if (faults.no_parallel_div) return base;
  if (faults.parallel_mult) return base * n;
  return base / n;
}

/**
 * Индуктивное сопротивление n трансформаторов, Ом.
 *   X_T = u_к[%] · U_вн² / (100 · S_ном) / n
 * Ошибки: XT_no_100 (забыт делитель 100), XT_wrong_U (вместо паспортного U_вн
 * взято номинальное напряжение сети), no_parallel_div, parallel_mult.
 * @param {{U_nom?:number}} ctx  номинальное напряжение сети (нужно для XT_wrong_U)
 */
export function X_T(uk_pct, Uvn, Sn, n, faults = {}, ctx = {}) {
  const U = faults.XT_wrong_U ? ctx.U_nom ?? 220 : Uvn;
  const base = (uk_pct * U ** 2) / ((faults.XT_no_100 ? 1 : 100) * Sn);
  if (faults.no_parallel_div) return base;
  if (faults.parallel_mult) return base * n;
  return base / n;
}

/**
 * Суммарные потери активной мощности х.х., МВт.  ΔP_x = n · ΔP_x1
 * (х.х. каждого трансформатора протекает независимо — потери СКЛАДЫВАЮТСЯ).
 * Ошибки: wrong_px_div (разделили на n), no_parallel_div (не учли n).
 */
export function dP_x_total(dPx_MW, n, faults = {}) {
  if (faults.wrong_px_div) return dPx_MW / n;
  if (faults.no_parallel_div) return dPx_MW;
  return n * dPx_MW;
}

/**
 * Суммарные потери реактивной мощности х.х., Мвар.
 *   ΔQ_x = n · I_x[%] · S_ном / 100   — от ПОЛНОЙ номинальной мощности.
 * Ошибки: Ix_from_P (вместо S_ном взята активная мощность ctx.P),
 *         wrong_px_div, no_parallel_div.
 * @param {{P?:number}} ctx  активная мощность на входе в трансформатор (для Ix_from_P)
 */
export function dQ_x_total(Ix_pct, Sn, n, faults = {}, ctx = {}) {
  const S = faults.Ix_from_P ? ctx.P ?? Sn : Sn;
  const k = (Ix_pct * S) / 100;
  if (faults.wrong_px_div) return k / n;
  if (faults.no_parallel_div) return k;
  return n * k;
}
