/**
 * Диагностика ошибки по числовому ответу студента.
 *
 *   diagnose(quantityId, studentValue, variant, { iteration })
 *
 * 1. Считаем ПРАВИЛЬНОЕ значение величины для варианта.
 * 2. Пересчитываем ту же величину с каждой числовой ошибкой из реестра —
 *    получаем «отпечатки» (misconception → значение).
 * 3. Ответ студента сравниваем с отпечатками с допуском (по умолчанию ±2 %;
 *    для напряжений — абсолютный, см. calc/quantities.js).
 * 4. Совпал с отпечатком → точный диагноз; совпало несколько (отпечатки ближе
 *    допуска друг к другу) → статус 'ambiguous' и список кандидатов,
 *    отсортированный по близости; не совпало ничего → 'unknown' + подсказка
 *    про единицы измерения.
 *
 * Значения студента — в ОТОБРАЖАЕМЫХ единицах величины (см. QUANTITIES).
 */
import { QUANTITIES, QUANTITY_KINDS, computeQuantity, toleranceFor, withinTol } from './quantities.js';
import { numericMisconceptions } from './misconceptions.js';

/** «в 2 раза больше верного», «в 220 раз больше верного», «в 1.5 раза меньше верного». */
const fmtRatio = (r) => {
  const k = r < 1 ? 1 / r : r;
  const n = Math.round(k);
  const isInt = Math.abs(k - n) < 0.05 * k;
  const num = isInt ? String(n) : k.toFixed(1);
  const word = !isInt || (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) ? 'раза' : 'раз';
  return `в ${num} ${word} ${r < 1 ? 'меньше' : 'больше'} верного`;
};

/**
 * @param {string} quantityId  ключ из QUANTITIES
 * @param {number} studentValue
 * @param {object} variant
 * @param {{iteration?:number, tol?:{pct?:number,abs?:number}}} [opts]
 * @returns {{
 *   status: 'correct'|'diagnosed'|'ambiguous'|'unknown',
 *   correctValue:number, studentValue:number, quantity:string, iteration:number,
 *   matches:{key:string,title:string,description:string,value:number,ratio:number}[],
 *   message:string, hint:string|null
 * }}
 */
export function diagnose(quantityId, studentValue, variant, opts = {}) {
  const q = QUANTITIES[quantityId];
  if (!q) throw new Error(`Неизвестная величина: ${quantityId}`);
  const iteration = opts.iteration ?? 1;
  const tol = toleranceFor(quantityId, opts.tol);
  const correctValue = computeQuantity(variant, quantityId, { iteration });
  const base = { correctValue, studentValue, quantity: quantityId, iteration };

  if (withinTol(studentValue, correctValue, tol)) {
    return { ...base, status: 'correct', matches: [], message: 'Верно.', hint: null };
  }

  const matches = [];
  for (const m of numericMisconceptions()) {
    const v = computeQuantity(variant, quantityId, { faults: { [m.key]: true }, iteration });
    if (!Number.isFinite(v)) continue;
    if (withinTol(v, correctValue, tol)) continue; // ошибка на этой величине не видна — неинформативна
    if (withinTol(studentValue, v, tol)) {
      matches.push({ key: m.key, title: m.title, description: m.description, value: v, ratio: studentValue / correctValue });
    }
  }
  matches.sort((a, b) => Math.abs(a.value - studentValue) - Math.abs(b.value - studentValue));

  if (matches.length) {
    // Ошибка СВОЕГО шага правдоподобнее той, что «протекла» из предыдущих шагов.
    const kinds = QUANTITY_KINDS[quantityId] ?? [];
    const isOwn = (m) => numericMisconceptions().find((x) => x.key === m.key).kinds.some((k) => kinds.includes(k));
    const own = matches.filter(isOwn);
    const other = matches.filter((m) => !isOwn(m));
    const ordered = [...own, ...other];
    const top = ordered[0];
    const ratioText = Number.isFinite(top.ratio) && top.ratio > 0 && Math.abs(top.ratio - 1) > 0.05 ? ` Ваш ответ ${fmtRatio(top.ratio)}.` : '';
    let message = `Похоже, вы ${top.description}.${ratioText}`;
    const unique = own.length === 1 || (own.length === 0 && other.length === 1);
    if (!unique) {
      message += ` Похожие варианты: ${ordered.slice(1).map((m) => m.title).join('; ')}.`;
    } else if (other.length && own.length === 1) {
      message += ` (Такое же число могло получиться и из-за ошибки в предыдущих шагах: ${other.map((m) => m.title).join('; ')}.)`;
    }
    return { ...base, status: unique ? 'diagnosed' : 'ambiguous', matches: ordered, message, hint: null };
  }

  // Совсем не то: частая причина — единицы измерения.
  const r = studentValue / correctValue;
  let hint = 'Проверьте единицы измерения и подстановку исходных данных (МВт, кВ, Ом, мкСм; проценты; радиус, а не диаметр).';
  if (Math.abs(r - 1000) / 1000 < 0.05) hint = 'Ответ ровно в 1000 раз больше верного — проверьте перевод кВт ↔ МВт (или Ом ↔ кОм).';
  else if (Math.abs(r - 0.001) / 0.001 < 0.05) hint = 'Ответ ровно в 1000 раз меньше верного — проверьте перевод кВт ↔ МВт (или мкСм ↔ См).';
  else if (Math.abs(r - 1e6) / 1e6 < 0.05 || Math.abs(r - 1e-6) / 1e-6 < 0.05) hint = 'Ответ отличается в миллион раз — проверьте См ↔ мкСм.';
  return { ...base, status: 'unknown', matches: [], message: 'Не совпало ни с верным значением, ни с типовыми ошибками.', hint };
}
