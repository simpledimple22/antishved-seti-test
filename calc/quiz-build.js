/**
 * Сборка банка вопросов из исходников (content-src/) в готовый JSON (content/).
 *
 * Чистые функции (без чтения файлов): их использует и scripts/build-quiz.mjs,
 * и тест «собранный JSON актуален».
 *
 * Плейсхолдеры в тексте (stem, options, explanation, feedback…):
 *   {{ref:Q[@it][|d]}}          значение величины Q на эталоне (итерация it, знаков d)
 *   {{fault:KEY:Q[@it][|d]}}    значение Q при ошибке KEY
 *   {{ratio:KEY:Q}}, {{inv:KEY:Q}}, {{pct:KEY:Q}}, {{diff:KEY:Q}}   — производные
 *   {{in:path[|d]}}             входные данные эталона (например {{in:wire.R0}})
 * В шаблонах фидбэка реестра ошибок: KEY = self (эта ошибка), Q = probe (её зонд).
 * Числа нигде не пишутся руками — только из движка и фикстуры.
 */
import { computeQuantity, digitsOf, QUANTITIES } from './quantities.js';
import { MISCONCEPTIONS } from './misconceptions.js';

const OPTION_TYPES = ['formula_choice', 'spot_the_error', 'units_check', 'effect_direction', 'concept'];
const LETTERS = ['a', 'b', 'c', 'd', 'e'];

/** Значение по пути «a.b.c» во входных данных варианта. */
const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

function fmtNum(x, d) {
  if (!Number.isFinite(x)) throw new Error(`Нечисловое значение в плейсхолдере: ${x}`);
  return d === undefined ? String(Math.round(x * 1e9) / 1e9) : x.toFixed(d);
}

/**
 * @param {object} refVariant  эталонный вариант (фикстура km2_reference.variant)
 * @returns {(text:string, ctx?:{self?:string}) => string}
 */
export function makeResolver(refVariant) {
  const cache = new Map();
  const value = (q, it, key) => {
    const k = `${q}|${it}|${key ?? ''}`;
    if (!cache.has(k)) cache.set(k, computeQuantity(refVariant, q, { iteration: it, faults: key ? { [key]: true } : {} }));
    return cache.get(k);
  };

  function resolveOne(body, ctx) {
    const [expr, digitsRaw] = body.split('|');
    const digits = digitsRaw === undefined ? undefined : Number(digitsRaw);
    const parts = expr.split(':');
    const kind = parts[0];
    if (kind === 'in') {
      const v = getPath(refVariant, parts[1]);
      if (v === undefined) throw new Error(`Нет входных данных: ${parts[1]}`);
      return typeof v === 'number' ? fmtNum(v, digits) : String(v);
    }
    const parseQ = (qRaw) => {
      let qid = qRaw;
      let it;
      if (qRaw.includes('@')) [qid, it] = [qRaw.split('@')[0], Number(qRaw.split('@')[1])];
      if (qid === 'probe') {
        const m = MISCONCEPTIONS[ctx.self];
        if (!m?.probe) throw new Error(`{{…probe…}} без зонда у ${ctx.self}`);
        qid = m.probe.q;
        it = it ?? m.probe.it;
      }
      if (!QUANTITIES[qid]) throw new Error(`Неизвестная величина в плейсхолдере: ${qRaw}`);
      return { qid, it: it ?? 1 };
    };
    const key = (k) => (k === 'self' ? ctx.self : k);
    let out;
    let qid;
    if (kind === 'ref') {
      const { qid: q, it } = parseQ(parts[1]);
      qid = q;
      out = value(q, it);
    } else if (['fault', 'ratio', 'inv', 'pct', 'diff'].includes(kind)) {
      const k = key(parts[1]);
      if (!MISCONCEPTIONS[k]) throw new Error(`Неизвестная ошибка в плейсхолдере: ${parts[1]}`);
      const { qid: q, it } = parseQ(parts[2]);
      qid = q;
      const ref = value(q, it);
      const f = value(q, it, k);
      out = { fault: f, ratio: f / ref, inv: ref / f, pct: (Math.abs(f - ref) / Math.abs(ref)) * 100, diff: Math.abs(f - ref) }[kind];
    } else throw new Error(`Неизвестный плейсхолдер: {{${body}}}`);
    return fmtNum(out, digits ?? (['ref', 'fault'].includes(kind) ? digitsOf(qid) : 1));
  }

  return (text, ctx = {}) => text.replace(/\{\{([^{}]+)\}\}/g, (_, body) => resolveOne(body.trim(), ctx));
}

/** Неразвёрнутый плейсхолдер вида {{ref:…}} (LaTeX-скобки «}}» — не плейсхолдер). */
export const findUnresolved = (text) => text.match(/\{\{(?:ref|fault|ratio|inv|pct|diff|in):[^}]*\}\}/)?.[0] ?? null;

/** Развернуть одну запись-источник в готовый вопрос. */
export function buildQuestion(src, resolve, overrides = {}) {
  const q = {
    id: src.id,
    test_id: src.test_id,
    type: src.type,
    topic: src.topic,
    difficulty: src.difficulty,
    stem: resolve(src.stem),
  };

  if (OPTION_TYPES.includes(src.type)) {
    q.options = src.options.map((o, i) => {
      let feedback;
      if (o.correct) feedback = resolve(o.feedback ?? 'Верно.');
      else {
        const m = MISCONCEPTIONS[o.misconception];
        if (!m) throw new Error(`${src.id}: неизвестный ключ ошибки «${o.misconception}»`);
        feedback = resolve(o.feedback ?? overrides[`${src.id}:${o.misconception}`] ?? m.feedback, { self: o.misconception });
        if (o.note) feedback += ` ${resolve(o.note, { self: o.misconception })}`;
      }
      return { id: LETTERS[i], text: resolve(o.text, { self: o.misconception }), correct: !!o.correct, misconception: o.correct ? null : o.misconception, feedback };
    });
  } else if (src.type === 'micro_calc') {
    const it = src.iteration ?? 1;
    const spec = QUANTITIES[src.quantity];
    if (!spec) throw new Error(`${src.id}: неизвестная величина ${src.quantity}`);
    q.answer = {
      quantity: src.quantity,
      iteration: it,
      value: Number(computeQuantity(resolve.refVariant, src.quantity, { iteration: it }).toPrecision(6)),
      unit: spec.unit,
      digits: spec.digits ?? 2,
      tolerance_pct: src.tolerance_pct ?? 1,
    };
  } else if (src.type === 'step_order') {
    q.items = src.items.map((t, i) => ({ id: `s${i + 1}`, text: resolve(t) })); // в ПРАВИЛЬНОМ порядке; UI перемешивает
    q.answer = { order: q.items.map((x) => x.id) };
  } else throw new Error(`${src.id}: неизвестный тип ${src.type}`);

  q.explanation = resolve(src.explanation);
  q.related_step = src.related_step;
  return q;
}

/**
 * @param {{TESTS:object[], QUESTIONS:object[]}} src  содержимое content-src/formula-quiz.mjs
 * @param {object} refVariant
 * @returns {object[]} массив тестов { id, title, description, questions }
 */
export function buildBank(src, refVariant) {
  const resolve = makeResolver(refVariant);
  resolve.refVariant = refVariant;
  return src.TESTS.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    questions: src.QUESTIONS.filter((q) => q.test_id === t.id).map((q) => buildQuestion(q, resolve, src.OVERRIDES ?? {})),
  }));
}
