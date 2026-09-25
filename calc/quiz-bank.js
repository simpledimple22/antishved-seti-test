/**
 * Логика банка вопросов «Расчёт режима» — чистые функции (без DOM и сети).
 *
 * • checkAnswer        — проверка ответа любого из 7 типов вопросов;
 * • recordResult       — обновление статистики по ошибкам (misconception);
 * • weakSpots          — «слабые места», отсортированные по частоте;
 * • selectByMisconceptions — сбор тренировочного теста по заданным ключам ошибок;
 * • scoreSession       — итог сессии.
 *
 * Статистика: { [misconceptionKey]: { wrong:int, right:int } }.
 *   «right» засчитывается за каждую ошибку, которую вопрос проверял и которой
 *   студент избежал; «wrong» — за ошибку, которую он допустил (выбранный
 *   дистрактор или диагноз по числовому ответу).
 */
import { diagnose } from './diagnose.js';
import { MISCONCEPTIONS, misconceptionsForKind } from './misconceptions.js';

const OPTION_TYPES = ['formula_choice', 'spot_the_error', 'units_check', 'effect_direction', 'concept'];

export const flattenBank = (tests) => tests.flatMap((t) => t.questions);

/** Ключи ошибок, которые проверяет вопрос. */
export function testedKeys(q) {
  if (OPTION_TYPES.includes(q.type)) return [...new Set(q.options.filter((o) => !o.correct).map((o) => o.misconception))];
  if (q.type === 'micro_calc') return misconceptionsForKind(q.related_step).filter((m) => m.numeric).map((m) => m.key);
  return [];
}

/**
 * Проверка ответа.
 * @param {object} q
 * @param {string|number|string[]} response  id варианта | число | массив id (порядок)
 * @param {{variant?:object}} [ctx]  вариант, по которому считается micro_calc (для диагностики)
 * @returns {{correct:boolean, feedback:string, misconception:string|null, diagnosis?:object}}
 */
export function checkAnswer(q, response, ctx = {}) {
  if (OPTION_TYPES.includes(q.type)) {
    const opt = q.options.find((o) => o.id === response);
    if (!opt) throw new Error(`Нет варианта ${response} в ${q.id}`);
    return { correct: opt.correct, feedback: opt.feedback, misconception: opt.correct ? null : opt.misconception };
  }
  if (q.type === 'micro_calc') {
    const a = q.answer;
    const tol = Math.max((a.tolerance_pct / 100) * Math.abs(a.value), 0.5 * 10 ** -a.digits);
    if (Number.isFinite(response) && Math.abs(response - a.value) <= tol) {
      return { correct: true, feedback: 'Верно.', misconception: null };
    }
    if (!ctx.variant || !Number.isFinite(response)) {
      return { correct: false, feedback: 'Неверно. Проверьте формулу, единицы и подстановку.', misconception: null };
    }
    const d = diagnose(a.quantity, response, ctx.variant, { iteration: a.iteration });
    if (d.status === 'correct') return { correct: true, feedback: 'Верно.', misconception: null, diagnosis: d };
    const key = d.matches[0]?.key ?? null;
    const feedback = d.status === 'unknown' ? `${d.message} ${d.hint}` : d.message;
    return { correct: false, feedback, misconception: key, diagnosis: d };
  }
  if (q.type === 'step_order') {
    const ok = Array.isArray(response) && response.length === q.answer.order.length && response.every((id, i) => id === q.answer.order[i]);
    if (ok) return { correct: true, feedback: 'Верно.', misconception: null };
    const text = new Map(q.items.map((x) => [x.id, x.text]));
    const seq = q.answer.order.map((id, i) => `${i + 1}) ${text.get(id)}`).join(' ');
    return { correct: false, feedback: `Порядок неверный. Правильная последовательность: ${seq}`, misconception: null };
  }
  throw new Error(`Неизвестный тип вопроса: ${q.type}`);
}

/** Обновить статистику ошибок по результату ответа (чистая функция). */
export function recordResult(progress, q, result) {
  const next = structuredClone(progress ?? {});
  const bump = (k, field) => {
    next[k] ??= { wrong: 0, right: 0 };
    next[k][field]++;
  };
  const keys = testedKeys(q);
  if (result.misconception) {
    bump(result.misconception, 'wrong');
    for (const k of keys) if (k !== result.misconception) bump(k, 'right');
  } else if (result.correct) {
    for (const k of keys) bump(k, 'right');
  }
  return next;
}

/**
 * Слабые места: ошибки, отсортированные по числу промахов (затем по доле).
 * @returns {{key:string,title:string,wrong:number,right:number,share:number}[]}
 */
export function weakSpots(progress, limit = 10) {
  return Object.entries(progress ?? {})
    .filter(([k, v]) => v.wrong > 0 && MISCONCEPTIONS[k])
    .map(([k, v]) => ({ key: k, title: MISCONCEPTIONS[k].title, wrong: v.wrong, right: v.right, share: v.wrong / (v.wrong + v.right) }))
    .sort((a, b) => b.wrong - a.wrong || b.share - a.share)
    .slice(0, limit);
}

/** Тренировка: вопросы, проверяющие хотя бы одну из заданных ошибок. */
export function selectByMisconceptions(questions, keys) {
  const set = new Set(keys);
  return questions.filter((q) => testedKeys(q).some((k) => set.has(k)));
}

/** Итог сессии: [{question, result}] → { correct, total, wrongKeys }. */
export function scoreSession(results) {
  const wrongKeys = {};
  let correct = 0;
  for (const { result } of results) {
    if (result.correct) correct++;
    else if (result.misconception) wrongKeys[result.misconception] = (wrongKeys[result.misconception] ?? 0) + 1;
  }
  return { correct, total: results.length, wrongKeys };
}

/** Перемешивание с внешним ГПСЧ (для тестируемости). */
export function shuffled(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
