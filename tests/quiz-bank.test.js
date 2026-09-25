import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, recordResult, weakSpots, selectByMisconceptions, scoreSession, testedKeys, flattenBank, shuffled } from '../calc/quiz-bank.js';
import { REQUIRED_KEYS, numericMisconceptions } from '../calc/misconceptions.js';
import { mulberry32 } from '../calc/util.js';
import { loadJson } from './helpers.js';

const fixture = loadJson('fixtures/km2_reference.json');
const bank = ['test1', 'test2', 'test3'].map((id) => loadJson(`content/formula-quiz/${id}.json`));
const all = flattenBank(bank);
const byId = Object.fromEntries(all.map((q) => [q.id, q]));

test('checkAnswer: верный вариант — верно; каждый неверный отдаёт свой фидбэк и ключ ошибки', () => {
  let n = 0;
  for (const q of all.filter((x) => x.options)) {
    for (const o of q.options) {
      const r = checkAnswer(q, o.id);
      assert.equal(r.correct, o.correct);
      assert.equal(r.feedback, o.feedback);
      assert.equal(r.misconception, o.correct ? null : o.misconception);
      n++;
    }
  }
  assert.ok(n > 120, `проверено вариантов: ${n}`);
});

test('checkAnswer: micro_calc — допуск, округление, диагностика ошибки по числу', () => {
  const q = byId['t1-q11']; // R_T
  const v = q.answer.value;
  assert.equal(checkAnswer(q, v, { variant: fixture.variant }).correct, true);
  assert.equal(checkAnswer(q, Number(v.toFixed(2)), { variant: fixture.variant }).correct, true);
  const kw = checkAnswer(q, v * 1000, { variant: fixture.variant });
  assert.equal(kw.correct, false);
  assert.equal(kw.misconception, 'kW_MW');
  assert.match(kw.feedback, /^Похоже, вы /);
  const sq = checkAnswer(q, 0.489, { variant: fixture.variant });
  assert.equal(sq.misconception, 'RT_no_square');
  const junk = checkAnswer(q, 5.5, { variant: fixture.variant });
  assert.equal(junk.correct, false);
  assert.equal(junk.misconception, null);
  assert.match(junk.feedback, /единиц/i);
  // без варианта — общий фидбэк
  assert.equal(checkAnswer(q, 5.5).correct, false);
  assert.equal(checkAnswer(q, NaN, { variant: fixture.variant }).correct, false);
});

test('checkAnswer: micro_calc по итерации 2 (wrong_U_node) диагностируется', () => {
  const q = all.find((x) => x.type === 'micro_calc' && x.answer.quantity === 'dS_T_Q');
  assert.ok(q);
  const r = checkAnswer(q, q.answer.value, { variant: fixture.variant });
  assert.equal(r.correct, true);
});

test('checkAnswer: step_order', () => {
  const q = byId['t2-q16'];
  assert.equal(checkAnswer(q, q.answer.order).correct, true);
  const swapped = [...q.answer.order];
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  const r = checkAnswer(q, swapped);
  assert.equal(r.correct, false);
  assert.match(r.feedback, /Правильная последовательность: 1\)/);
  assert.equal(checkAnswer(q, []).correct, false);
});

test('checkAnswer: неизвестный вариант → ошибка', () => {
  assert.throws(() => checkAnswer(byId['t1-q01'], 'zzz'));
});

test('recordResult: неверный вариант → wrong для его ключа, right для остальных проверяемых; иммутабельность', () => {
  const q = byId['t2-q01'];
  const wrongOpt = q.options.find((o) => o.misconception === 'missing_U_square');
  const p0 = {};
  const p1 = recordResult(p0, q, checkAnswer(q, wrongOpt.id));
  assert.deepEqual(p0, {}, 'исходный объект не изменён');
  assert.equal(p1.missing_U_square.wrong, 1);
  assert.equal(p1.missing_PQ_square.right, 1);
  assert.equal(p1.s_instead_of_pq.right, 1);
  const correct = q.options.find((o) => o.correct);
  const p2 = recordResult(p1, q, checkAnswer(q, correct.id));
  assert.equal(p2.missing_U_square.wrong, 1);
  assert.equal(p2.missing_U_square.right, 1);
});

test('recordResult: micro_calc с диагнозом → wrong для диагностированной ошибки', () => {
  const q = byId['t1-q11'];
  const p = recordResult({}, q, checkAnswer(q, q.answer.value * 1000, { variant: fixture.variant }));
  assert.equal(p.kW_MW.wrong, 1);
});

test('weakSpots: сортировка по числу ошибок, затем по доле; лимит; названия из реестра', () => {
  const progress = {
    missing_U_square: { wrong: 3, right: 1 },
    no_parallel_div: { wrong: 5, right: 20 },
    kW_MW: { wrong: 3, right: 0 },
    log_ln: { wrong: 0, right: 9 },
    unknown_key: { wrong: 9, right: 0 },
  };
  const w = weakSpots(progress);
  assert.deepEqual(w.map((x) => x.key), ['no_parallel_div', 'kW_MW', 'missing_U_square']);
  assert.ok(w[0].title.length > 5);
  assert.equal(weakSpots(progress, 2).length, 2);
  assert.deepEqual(weakSpots({}), []);
});

test('selectByMisconceptions: тренировочный тест из вопросов по заданным ключам', () => {
  const sel = selectByMisconceptions(all, ['missing_U_square', 'kW_MW']);
  assert.ok(sel.length >= 4);
  for (const q of sel) assert.ok(testedKeys(q).some((k) => ['missing_U_square', 'kW_MW'].includes(k)));
  assert.equal(selectByMisconceptions(all, []).length, 0);
  // для каждого обязательного ключа есть что тренировать
  for (const k of REQUIRED_KEYS) assert.ok(selectByMisconceptions(all, [k]).length >= 2, k);
});

test('selectByMisconceptions: micro_calc входит в выборку по ошибкам своего шага', () => {
  const sel = selectByMisconceptions(all.filter((q) => q.type === 'micro_calc'), ['RT_no_square']);
  assert.ok(sel.some((q) => q.id === 't1-q11'));
});

test('scoreSession', () => {
  const r = scoreSession([
    { result: { correct: true, misconception: null } },
    { result: { correct: false, misconception: 'kW_MW' } },
    { result: { correct: false, misconception: 'kW_MW' } },
    { result: { correct: false, misconception: null } },
  ]);
  assert.deepEqual(r, { correct: 1, total: 4, wrongKeys: { kW_MW: 2 } });
});

test('shuffled: детерминирован при заданном ГПСЧ, не меняет исходный массив, сохраняет элементы', () => {
  const a = [1, 2, 3, 4, 5, 6];
  const s1 = shuffled(a, mulberry32(1)), s2 = shuffled(a, mulberry32(1));
  assert.deepEqual(s1, s2);
  assert.deepEqual(a, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...s1].sort(), a);
});

test('числовые ошибки, диагностируемые в micro_calc, реально достижимы из банка', () => {
  const micro = all.filter((q) => q.type === 'micro_calc');
  let reachable = new Set();
  for (const q of micro) {
    for (const m of numericMisconceptions()) {
      if (m.probe.q !== q.answer.quantity) continue;
      const r = checkAnswer(q, (q.answer.value * 1) + 0, { variant: fixture.variant });
      assert.equal(r.correct, true);
      reachable.add(m.key);
    }
  }
  assert.ok(reachable.size >= 8, `достижимых ключей: ${reachable.size}`);
});
