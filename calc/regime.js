/**
 * Формулы режима: потери, зарядная мощность, падение напряжения.
 *
 * Единицы: P, Q — МВт/Мвар; U — кВ; R, X — Ом; B — См.
 * При этих единицах потери получаются сразу в МВт/Мвар, а Q_c = U²·B/2 — сразу
 * в Мвар: НИКАКИХ переводных коэффициентов (проверяется тестом на размерность
 * через физический расчёт в амперах и вольтах).
 */

/**
 * Потери мощности в продольной ветви, МВА.
 *   ΔS = (P² + Q²) / U² · (R + jX)
 * Квадраты — И в числителе (P², Q²), И в знаменателе (U²).
 * Ошибки: missing_U_square (делили на U вместо U²),
 *         missing_PQ_square (числитель (P+Q), а не P²+Q²).
 * @returns {{P:number, Q:number}} ΔP (МВт), ΔQ (Мвар)
 */
export function dS(P, Q, U, R, X, faults = {}) {
  let k;
  if (faults.missing_U_square) k = (P * P + Q * Q) / U;
  else if (faults.missing_PQ_square) k = (P + Q) / (U * U);
  else k = (P * P + Q * Q) / (U * U);
  return { P: k * R, Q: k * X };
}

/**
 * Зарядная мощность узла (генерируется), Мвар.  Q_c = U² · B/2
 * @param {number} U      кВ
 * @param {number} Bhalf  В/2, См (половина проводимости линии — в один конец)
 * Ошибка: Qc_no_half (Q_c = U²·B — половину не взяли).
 * Знак «+» (генерация) — в решателе; ошибка Qc_sign — там же.
 */
export function Qc(U, Bhalf, faults = {}) {
  return faults.Qc_no_half ? U * U * 2 * Bhalf : U * U * Bhalf;
}

/**
 * Продольная составляющая падения напряжения, кВ.  dU = (P·R + Q·X) / U
 * Ошибка: dU_deltaU_swap (взята формула поперечной составляющей).
 */
export function dU(P, Q, R, X, U, faults = {}) {
  return faults.dU_deltaU_swap ? (P * X - Q * R) / U : (P * R + Q * X) / U;
}

/**
 * Поперечная составляющая падения напряжения, кВ.  δU = (P·X − Q·R) / U
 * Ошибка: dU_deltaU_swap.
 */
export function deltaU(P, Q, R, X, U, faults = {}) {
  return faults.dU_deltaU_swap ? (P * R + Q * X) / U : (P * X - Q * R) / U;
}

/**
 * Модуль напряжения в начале ветви, кВ.
 *   U_начала = sqrt((U_конца + dU)² + δU²)
 * Ошибка: no_transverse (U = U_конца + dU — поперечная составляющая
 * отброшена; для 220 кВ это занижает результат на доли кВ, δU² / (2U)).
 */
export function voltageModulus(Uend, dUv, deltaUv, faults = {}) {
  return faults.no_transverse ? Uend + dUv : Math.hypot(Uend + dUv, deltaUv);
}

/**
 * Напряжение на стороне НН, кВ (без РПН — коэффициент трансформации
 * фиксирован: U_нн = U_вн_расч · U_нн_ном / U_вн_ном).
 * Ошибка: nn_no_ratio (коэффициент трансформации не учтён).
 */
export function nnVoltage(U_hv, Uvn, Unn, faults = {}) {
  return faults.nn_no_ratio ? U_hv : (U_hv * Unn) / Uvn;
}
