import test from 'node:test';
import assert from 'node:assert/strict';
import { MISCONCEPTIONS, REQUIRED_KEYS, listMisconceptions, numericMisconceptions, misconceptionsForKind } from '../calc/misconceptions.js';
import { QUANTITIES, computeQuantity, toleranceFor, withinTol, digitsOf } from '../calc/quantities.js';
import { diagnose } from '../calc/diagnose.js';
import { loadJson } from './helpers.js';

const variant = loadJson('fixtures/km2_reference.json').variant;

test('реестр: все 20 обязательных ключей на месте, ключи уникальны', () => {
  for (const k of REQUIRED_KEYS) assert.ok(MISCONCEPTIONS[k], `нет ключа ${k}`);
  assert.equal(REQUIRED_KEYS.length, 20);
  const keys = listMisconceptions().map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('реестр: у каждой записи есть title, description, feedback, kinds, transform', () => {
  for (const m of listMisconceptions()) {
    for (const f of ['title', 'description', 'feedback', 'category']) assert.ok(m[f] && typeof m[f] === 'string', `${m.key}.${f}`);
    assert.ok(Array.isArray(m.kinds) && m.kinds.length, `${m.key}.kinds`);
    const t = m.transform({ a: 1 });
    assert.deepEqual(t.faults, { [m.key]: true });
    assert.deepEqual(t.params, { a: 1 });
    if (m.numeric) {
      assert.ok(m.probe && QUANTITIES[m.probe.q], `${m.key}: probe.q`);
      assert.ok(Number.isInteger(m.probe.it) && m.probe.it >= 1);
    } else assert.equal(m.probe, null, `${m.key}: у понятийной ошибки нет зонда`);
  }
});

test('s_instead_of_pq — не числовая ошибка (S² ≡ P²+Q²): только концептуальные вопросы', () => {
  assert.equal(MISCONCEPTIONS.s_instead_of_pq.numeric, false);
  // «диагностика по 19 числовым ключам из 20 обязательных»
  const numericRequired = REQUIRED_KEYS.filter((k) => MISCONCEPTIONS[k].numeric);
  assert.equal(numericRequired.length, 19);
});

test('misconceptionsForKind: находит ошибки шага', () => {
  assert.ok(misconceptionsForKind('R_T').some((m) => m.key === 'RT_no_square'));
  assert.ok(misconceptionsForKind('dS_line').some((m) => m.key === 'missing_U_square'));
});

test('зонд каждой числовой ошибки ОТЛИЧИМ от верного значения (в допуске величины)', () => {
  for (const m of numericMisconceptions()) {
    const { q, it, tol } = m.probe;
    const ref = computeQuantity(variant, q, { iteration: it });
    const val = computeQuantity(variant, q, { iteration: it, faults: { [m.key]: true } });
    assert.ok(Number.isFinite(val), `${m.key}: значение не конечно`);
    assert.ok(!withinTol(val, ref, toleranceFor(q, tol)), `${m.key}: неотличима от верного (${val} vs ${ref})`);
  }
});

// ── критерий №6: для каждого ключа подаём искажённое значение → диагноз верный ──
for (const m of numericMisconceptions()) {
  test(`diagnose: ${m.key} распознаётся по искажённому ответу`, () => {
    const { q, it, tol } = m.probe;
    const distorted = computeQuantity(variant, q, { iteration: it, faults: { [m.key]: true } });
    const r = diagnose(q, distorted, variant, { iteration: it, tol });
    assert.equal(r.status, 'diagnosed', `${m.key}: статус ${r.status}; кандидаты: ${r.matches.map((x) => x.key)}`);
    assert.equal(r.matches[0].key, m.key);
    assert.match(r.message, /^Похоже, вы /);
    // студент округляет ответ — до знаков интерфейса или до 3 значащих цифр (что точнее);
    // диагноз не должен ломаться
    const sig3 = Math.max(0, 2 - Math.floor(Math.log10(Math.abs(distorted))));
    const rounded = Number(distorted.toFixed(Math.max(digitsOf(q), sig3)));
    const r2 = diagnose(q, rounded, variant, { iteration: it, tol });
    assert.equal(r2.matches[0]?.key, m.key, `${m.key}: после округления (${rounded})`);
  });
}

test('diagnose: верный ответ (в том числе округлённый) → correct', () => {
  for (const q of ['x0', 'R_line', 'R_T', 'X_T', 'B_half', 'dQ_x_total', 'U_nn']) {
    const c = computeQuantity(variant, q);
    assert.equal(diagnose(q, c, variant).status, 'correct', q);
    assert.equal(diagnose(q, Number(c.toFixed(digitsOf(q))), variant).status, 'correct', `${q} округл.`);
  }
  for (const it of [1, 2, 3]) {
    for (const q of ['Qc1', 'dS_line_P', 'S2_Q', 'U1', 'U2']) {
      const c = computeQuantity(variant, q, { iteration: it });
      assert.equal(diagnose(q, Number(c.toFixed(digitsOf(q))), variant, { iteration: it }).status, 'correct', `${q}@${it}`);
    }
  }
});

test('diagnose: ответ не похож ни на что → unknown + подсказка про единицы', () => {
  const r = diagnose('R_line', 5.5, variant);
  assert.equal(r.status, 'unknown');
  assert.match(r.hint, /единиц/i);
});

test('diagnose: ×1000 от верного → отдельная подсказка про кВт/МВт, если не совпало с ошибкой', () => {
  const r = diagnose('X_T', 76.04 * 1000 * 3, variant);
  assert.equal(r.status, 'unknown');
  const r2 = diagnose('Qc1', 10.65 * 1000, variant);
  assert.equal(r2.status, 'unknown');
  assert.match(r2.hint, /1000/);
});

test('diagnose: ошибка «протекла» из предыдущего шага — ищем по всем ошибкам', () => {
  // студент удвоил R_line (забыл n) и честно посчитал потери в линии дальше
  const dbl = computeQuantity(variant, 'dS_line_P', { faults: { no_parallel_div: true } });
  const r = diagnose('dS_line_P', dbl, variant);
  assert.ok(r.matches.some((x) => x.key === 'no_parallel_div'), r.matches.map((x) => x.key).join());
});

test('no_transverse: приоритет ошибки своего шага над протёкшей RT_no_square', () => {
  const r = diagnose('U2', computeQuantity(variant, 'U2', { faults: { no_transverse: true } }), variant);
  assert.equal(r.status, 'diagnosed');
  assert.equal(r.matches[0].key, 'no_transverse');
});

test('diagnose: неизвестная величина → ошибка', () => {
  assert.throws(() => diagnose('nope', 1, variant));
});
