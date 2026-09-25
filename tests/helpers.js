import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

export const loadJson = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));

/**
 * |actual − expected| ≤ max(pct% · |expected|, floor).
 * floor — половина последнего разряда эталонной таблицы (напр. 0.005 для «0.19»):
 * для малых величин ±1 % строже самого округления таблицы.
 */
export function expectClose(actual, expected, { pct = 1, floor = 0, label = '' } = {}) {
  const tol = Math.max((pct / 100) * Math.abs(expected), floor);
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label} ожидалось ≈ ${expected} (±${tol.toPrecision(3)}), получено ${actual}`
  );
}
