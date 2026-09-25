import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { readFileSync, readdirSync } from 'node:fs';
import { REQUIRED_KEYS, MISCONCEPTIONS } from '../calc/misconceptions.js';
import { buildBank, findUnresolved } from '../calc/quiz-build.js';
import { buildSteps } from '../calc/steps.js';
import { computeQuantity } from '../calc/quantities.js';
import { diagnose } from '../calc/diagnose.js';
import { generateVariant } from '../calc/variants.js';
import * as src from '../content-src/formula-quiz.mjs';
import { loadJson } from './helpers.js';

const fixture = loadJson('fixtures/km2_reference.json');
const tests = ['test1', 'test2', 'test3'].map((id) => loadJson(`content/formula-quiz/${id}.json`));
const questions = tests.flatMap((t) => t.questions);

// ── схемы ──
const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
const schemaFiles = readdirSync(new URL('../content/schema/', import.meta.url)).filter((f) => f.endsWith('.json'));
for (const f of schemaFiles) ajv.addSchema(JSON.parse(readFileSync(new URL(`../content/schema/${f}`, import.meta.url), 'utf8')));
const validate = (schemaId, data) => {
  const v = ajv.getSchema(schemaId);
  const ok = v(data);
  assert.ok(ok, `${schemaId}: ${JSON.stringify(v.errors?.slice(0, 3))}`);
};

test('§8.7 фикстура и эталонный вариант валидны по схеме', () => {
  validate('fixture.schema.json', fixture);
});

test('§8.7 все тесты банка валидны по схеме', () => {
  for (const t of tests) validate('test.schema.json', t);
});

test('§8.7 сгенерированные варианты валидны по схеме', () => {
  for (const type of ['A', 'B']) for (let seed = 1; seed <= 30; seed++) validate('variant.schema.json', generateVariant(seed, { type }));
});

// ── состав банка (критерий №5) ──
test('§8.5 в банке ≥ 45 вопросов, три теста', () => {
  assert.equal(tests.length, 3);
  assert.ok(questions.length >= 45, `вопросов: ${questions.length}`);
  for (const t of tests) assert.ok(t.questions.length >= 15, `${t.id}: ${t.questions.length}`);
});

test('id уникальны, test_id и префикс id согласованы с файлом', () => {
  assert.equal(new Set(questions.map((q) => q.id)).size, questions.length);
  for (const t of tests) for (const q of t.questions) {
    assert.equal(q.test_id, t.id);
    assert.ok(q.id.startsWith(`t${t.id.slice(-1)}-`), q.id);
  }
});

test('использованы все 7 типов вопросов и все 3 уровня сложности', () => {
  const types = new Set(questions.map((q) => q.type));
  for (const t of ['formula_choice', 'spot_the_error', 'micro_calc', 'units_check', 'effect_direction', 'step_order', 'concept']) assert.ok(types.has(t), `нет типа ${t}`);
  assert.deepEqual([...new Set(questions.map((q) => q.difficulty))].sort(), [1, 2, 3]);
});

test('§8.5 каждый ключ ошибки из §5.2 встречается минимум в двух ВОПРОСАХ', () => {
  const count = {};
  for (const q of questions) {
    const keys = new Set((q.options ?? []).filter((o) => !o.correct).map((o) => o.misconception));
    for (const k of keys) count[k] = (count[k] ?? 0) + 1;
  }
  for (const k of REQUIRED_KEYS) assert.ok((count[k] ?? 0) >= 2, `ключ ${k}: вопросов ${count[k] ?? 0}`);
});

test('§8.5 у каждого неверного варианта заполнены misconception и feedback; ровно один верный', () => {
  for (const q of questions.filter((x) => x.options)) {
    assert.equal(q.options.filter((o) => o.correct).length, 1, `${q.id}: верных вариантов != 1`);
    const ids = q.options.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const o of q.options) {
      assert.ok(o.feedback && o.feedback.trim().length >= 5, `${q.id}/${o.id}: пустой feedback`);
      if (o.correct) assert.equal(o.misconception, null);
      else {
        assert.ok(MISCONCEPTIONS[o.misconception], `${q.id}/${o.id}: ключ «${o.misconception}» не из реестра`);
        assert.ok(o.feedback.length >= 40, `${q.id}/${o.id}: фидбэк слишком короткий, чтобы быть конкретным`);
        assert.doesNotMatch(o.feedback, /попробуйте ещё|неверно\.?$/i, `${q.id}/${o.id}: общий фидбэк`);
      }
    }
  }
});

test('у micro_calc — ровно один правильный ответ, согласованный с движком и диагностикой', () => {
  for (const q of questions.filter((x) => x.type === 'micro_calc')) {
    const a = q.answer;
    const v = computeQuantity(fixture.variant, a.quantity, { iteration: a.iteration });
    assert.ok(Math.abs(v - a.value) <= 1e-4 * Math.max(1, Math.abs(v)), `${q.id}`);
    assert.equal(diagnose(a.quantity, a.value, fixture.variant, { iteration: a.iteration }).status, 'correct', q.id);
  }
});

test('step_order: элементы уникальны, ответ — перестановка элементов', () => {
  for (const q of questions.filter((x) => x.type === 'step_order')) {
    const ids = q.items.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual([...q.answer.order].sort(), [...ids].sort());
  }
});

test('related_step ссылается на существующий вид шага разбора', () => {
  const kinds = new Set(buildSteps(fixture.variant).steps.map((s) => s.kind));
  for (const q of questions) assert.ok(kinds.has(q.related_step), `${q.id}: related_step «${q.related_step}» нет среди шагов`);
});

test('формулы: число знаков $ чётно, скобки {} внутри формул сбалансированы, нет неразвёрнутых плейсхолдеров', () => {
  const texts = [];
  for (const q of questions) {
    texts.push([q.id, q.stem], [q.id, q.explanation]);
    for (const o of q.options ?? []) texts.push([`${q.id}/${o.id}`, o.text], [`${q.id}/${o.id}`, o.feedback]);
    for (const i of q.items ?? []) texts.push([`${q.id}/${i.id}`, i.text]);
  }
  for (const [where, s] of texts) {
    assert.equal(findUnresolved(s), null, `${where}: неразвёрнутый плейсхолдер`);
    assert.equal((s.match(/\$/g) ?? []).length % 2, 0, `${where}: нечётное число $ — «${s.slice(0, 80)}»`);
    const segs = s.split('$').filter((_, i) => i % 2 === 1);
    for (const m of segs) {
      let d = 0;
      for (const ch of m) { if (ch === '{') d++; if (ch === '}') d--; assert.ok(d >= 0, `${where}: лишняя } в «${m}»`); }
      assert.equal(d, 0, `${where}: несбалансированные {} в «${m}»`);
    }
  }
});

test('числа в тексте берутся из движка: собранный JSON актуален (npm run build:quiz)', () => {
  const rebuilt = buildBank(src, fixture.variant);
  for (const t of rebuilt) {
    const onDisk = tests.find((x) => x.id === t.id);
    assert.deepEqual(JSON.parse(JSON.stringify(t)), onDisk, `${t.id}: content/ устарел — запустите npm run build:quiz`);
  }
});

test('OVERRIDES фидбэка привязаны к существующим вариантам', () => {
  const ids = new Set(src.QUESTIONS.flatMap((q) => (q.options ?? []).filter((o) => !o.correct).map((o) => `${q.id}:${o.misconception}`)));
  for (const k of Object.keys(src.OVERRIDES)) assert.ok(ids.has(k), `override «${k}» без варианта`);
});

test('ключевые фидбэки конкретны: называют ошибку и приводят числа (пример из ТЗ)', () => {
  const q = questions.find((x) => x.id === 't2-q01');
  const fb = q.options.find((o) => o.misconception === 'missing_U_square').feedback;
  assert.match(fb, /квадрат напряжения в знаменателе/);
  assert.match(fb, /48\.\d/);      // потери ≈ 48.7 МВт
  assert.match(fb, /0\.22/);       // вместо 0.22 МВт
  assert.match(fb, /220 раз|222 раз|221 раз|219 раз/);
  assert.match(fb, /физически невозможн/);
});
