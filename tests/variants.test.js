import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVariant, sanityCheck, WIRES, TRANSFORMERS } from '../calc/variants.js';
import { buildSteps } from '../calc/steps.js';
import { computeQuantity, applicableQuantities } from '../calc/quantities.js';
import { diagnose } from '../calc/diagnose.js';
import { numericMisconceptions } from '../calc/misconceptions.js';

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

test('детерминированность: один seed → один и тот же вариант', () => {
  for (const type of ['A', 'B']) {
    assert.deepEqual(generateVariant(42, { type }), generateVariant(42, { type }));
  }
  assert.notDeepEqual(generateVariant(1), generateVariant(2));
  assert.notDeepEqual(generateVariant(7, { type: 'A' }), generateVariant(7, { type: 'B' }));
});

for (const type of ['A', 'B']) {
  test(`200 seed'ов, тип ${type}: 100 % вариантов проходят sanity-check`, () => {
    let maxIt = 0, rejected = 0;
    for (const seed of SEEDS) {
      const v = generateVariant(seed, { type });
      const s = sanityCheck(v);
      assert.ok(s.ok, `seed ${seed}: ${s.reasons.join('; ')}`);
      assert.ok(s.iterations <= 6);
      maxIt = Math.max(maxIt, s.iterations);
      rejected += v.attempt;
    }
    console.log(`  тип ${type}: макс. итераций ${maxIt}; отбраковано кандидатов на 200 вариантов: ${rejected}`);
  });

  test(`тип ${type}: значения в заданных физических диапазонах`, () => {
    for (const seed of SEEDS) {
      const v = generateVariant(seed, { type });
      assert.ok(v.S_start.P >= 25 && v.S_start.P <= 60, 'P1');
      assert.ok(v.S_start.tgphi >= 0.3 && v.S_start.tgphi <= 0.6, 'tgφ');
      assert.ok(v.U_end >= 210 && v.U_end <= 225, 'U_end');
      const lines = type === 'A' ? [{ wire: v.wire, L: v.L, n: v.n_line }] : v.lines;
      for (const l of lines) {
        assert.ok(WIRES.some((w) => w.name === l.wire.name && w.R0 === l.wire.R0 && w.d_mm === l.wire.d_mm), 'марка провода');
        assert.ok(l.wire.D_m >= 7 && l.wire.D_m <= 9, 'D_ср');
        assert.ok([1, 2].includes(l.n), 'число цепей');
        assert.ok(l.L >= (type === 'A' ? 60 : 30) && l.L <= (type === 'A' ? 120 : 90), `L=${l.L}`);
      }
      if (type === 'A') assert.ok(TRANSFORMERS.some((t) => t.name === v.transformer.name), 'трансформатор');
      else assert.ok(v.mid_load.P >= 10 && v.mid_load.P <= v.S_start.P);
    }
  });
}

test('варианты дают полный разбор, а величины и диагностика на них работают', () => {
  for (const seed of [3, 17, 99, 150]) {
    for (const type of ['A', 'B']) {
      const v = generateVariant(seed, { type });
      const { steps } = buildSteps(v);
      assert.ok(steps.length > 20);
      for (const q of applicableQuantities(v)) {
        const c = computeQuantity(v, q);
        assert.ok(Number.isFinite(c), `${q} на варианте ${type}${seed}`);
      }
    }
  }
});

test('диагностика работает на случайных вариантах типа A: искажённое значение → своя ошибка', () => {
  let checked = 0;
  for (const seed of [5, 11, 23, 41, 77, 120]) {
    const v = generateVariant(seed, { type: 'A' });
    for (const m of numericMisconceptions()) {
      const { q, it, tol } = m.probe;
      const ref = computeQuantity(v, q, { iteration: it });
      const val = computeQuantity(v, q, { iteration: it, faults: { [m.key]: true } });
      const r = diagnose(q, val, v, { iteration: it, tol });
      // на конкретном варианте отпечаток может «слиться» с верным значением (например, n_line=1) —
      // тогда ошибка просто неинформативна, и диагноз 'correct' — верный ответ системы
      if (r.status === 'correct') { assert.ok(Math.abs(val - ref) <= Math.abs(ref) * 0.05 + 0.2, `${m.key}@${seed}`); continue; }
      assert.ok(r.matches.some((x) => x.key === m.key), `${m.key}@${seed}: ${r.matches.map((x) => x.key)}`);
      checked++;
    }
  }
  assert.ok(checked > 80, `проверено ${checked}`);
});
