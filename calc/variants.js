/**
 * Генератор вариантов задач.
 *
 *   generateVariant(seed, { type: 'A' | 'B' })
 *
 * • Детерминирован: один и тот же (seed, type) → один и тот же вариант.
 * • Физически осмысленные диапазоны (см. каталоги ниже).
 * • Каждый вариант проходит sanity-check (сходимость ≤ 6 итераций, напряжения
 *   в 0.9–1.15 от номинала, мощность на конце положительна). Не прошедший
 *   вариант студенту не отдаётся: перебираем следующие «попытки» от того же
 *   seed (тоже детерминированно).
 *
 * Паспортные данные — типовые справочные значения; сверьте со своим
 * справочником, если преподаватель требует конкретные цифры.
 */
import { mulberry32, hashString, round } from './util.js';
import { solveVariant } from './run.js';

/** Провода ВЛ 220 кВ: R0 [Ом/км], наружный диаметр d [мм]. */
export const WIRES = [
  { name: 'АС 240/32', R0: 0.121, d_mm: 21.6 },
  { name: 'АС 300/39', R0: 0.096, d_mm: 24.0 },
  { name: 'АС 400/51', R0: 0.075, d_mm: 27.5 },
];

/** Трансформаторы ТРДН 220 кВ (U_вн = 230 кВ, U_нн = 11 кВ). */
export const TRANSFORMERS = [
  { name: 'ТРДН-25000/220', dPk_kW: 135, uk_pct: 12.0, dPx_kW: 45, Ix_pct: 1.0, Sn: 25 },
  { name: 'ТРДН-40000/220', dPk_kW: 170, uk_pct: 11.5, dPx_kW: 50, Ix_pct: 0.9, Sn: 40 },
  { name: 'ТРДН-63000/220', dPk_kW: 265, uk_pct: 11.5, dPx_kW: 70, Ix_pct: 0.8, Sn: 63 },
].map((t) => ({ ...t, Uvn: 230, Unn: 11 }));

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const uniform = (rnd, a, b, step) => round(a + Math.floor((rnd() * (b - a)) / step + 1e-9) * step, 6);

function sample(rnd, type) {
  const U_nom = 220;
  const S_start = { P: uniform(rnd, 25, 60, 1), tgphi: uniform(rnd, 0.3, 0.6, 0.001) };
  const U_end = uniform(rnd, 210, 225, 1);
  const wireOf = () => {
    const w = pick(rnd, WIRES);
    return { ...w, D_m: uniform(rnd, 7, 9, 0.5) };
  };
  if (type === 'A') {
    const t = pick(rnd, TRANSFORMERS);
    return {
      type: 'A', U_nom, wire: wireOf(), L: uniform(rnd, 60, 120, 1), n_line: rnd() < 0.5 ? 1 : 2,
      transformer: { ...t, n: 2 }, S_start, U_end,
    };
  }
  const mid = { P: uniform(rnd, 10, S_start.P * 0.6, 1), tgphi: uniform(rnd, 0.3, 0.6, 0.001) };
  return {
    type: 'B', U_nom,
    lines: [
      { wire: wireOf(), L: uniform(rnd, 40, 90, 1), n: rnd() < 0.5 ? 1 : 2 },
      { wire: wireOf(), L: uniform(rnd, 30, 80, 1), n: rnd() < 0.5 ? 1 : 2 },
    ],
    mid_load: mid, S_start, U_end,
  };
}

/**
 * Проверка «физической осмысленности» варианта.
 * @returns {{ok:boolean, reasons:string[], iterations:number}}
 */
export function sanityCheck(variant) {
  const reasons = [];
  let sol;
  try {
    sol = solveVariant(variant).sol;
  } catch (e) {
    return { ok: false, reasons: [`исключение: ${e.message}`], iterations: 0 };
  }
  const iterations = sol.iterations.length;
  if (!sol.converged) reasons.push('не сошёлся');
  if (iterations > 6) reasons.push(`итераций ${iterations} > 6`);
  const Un = variant.U_nom;
  const nodesToCheck = sol.result.U.slice(0, variant.type === 'A' ? 2 : 3); // U задано в конечной точке — её не проверяем в A
  for (const u of nodesToCheck) {
    if (!(u >= 0.9 * Un && u <= 1.15 * Un)) reasons.push(`U = ${u.toFixed(1)} вне 0.9–1.15 U_ном`);
  }
  const S = sol.result.S_end;
  if (!(S.P > 0)) reasons.push(`P на конце ${S.P.toFixed(2)} ≤ 0`);
  if (!(S.Q > 0)) reasons.push(`Q на конце ${S.Q.toFixed(2)} ≤ 0`);
  return { ok: reasons.length === 0, reasons, iterations };
}

/**
 * @param {number} seed
 * @param {{type?:'A'|'B', maxAttempts?:number}} [opts]
 * @returns {object} вариант (+ seed, attempt)
 */
export function generateVariant(seed, { type = 'A', maxAttempts = 100 } = {}) {
  const rnd = mulberry32(hashString(`${type}:${seed}`));
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = sample(rnd, type);
    if (sanityCheck(candidate).ok) return { ...candidate, seed, attempt };
  }
  throw new Error(`Не удалось сгенерировать вариант (seed=${seed}, type=${type}) за ${maxAttempts} попыток`);
}
