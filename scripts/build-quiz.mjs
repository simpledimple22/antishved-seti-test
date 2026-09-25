// Сборка банка: content-src/formula-quiz.mjs → content/formula-quiz/test{1,2,3}.json
// Запуск: npm run build:quiz
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildBank, findUnresolved } from '../calc/quiz-build.js';
import * as src from '../content-src/formula-quiz.mjs';

const fx = JSON.parse(readFileSync(new URL('../fixtures/km2_reference.json', import.meta.url), 'utf8'));
const outDir = new URL('../content/formula-quiz/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const bank = buildBank(src, fx.variant);
let total = 0;
for (const test of bank) {
  const text = JSON.stringify(test, null, 2) + '\n';
  const bad = findUnresolved(text);
  if (bad) throw new Error(`Не развёрнут плейсхолдер: ${bad} в ${test.id}`);
  writeFileSync(new URL(`${test.id}.json`, outDir), text);
  total += test.questions.length;
  console.log(`${test.id}: ${test.questions.length} вопросов`);
}
console.log(`Итого: ${total} вопросов → content/formula-quiz/`);
