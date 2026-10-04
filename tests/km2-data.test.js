import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { loadJson } from './helpers.js';

const data = loadJson('questions_km2.json');
const path = (p) => new URL(`../${p}`, import.meta.url);
const textOf = (o) => (typeof o === 'string' ? o : null);

test('КМ-2: набор непустой, id уникальны и совпадают с номерами вопросов', () => {
  assert.ok(data.length >= 400, `вопросов: ${data.length}`);
  assert.equal(new Set(data.map((q) => q.id)).size, data.length);
  for (const q of data) assert.equal(q.id, q.n);
});

test('КМ-2: у каждого вопроса есть текст, ≥2 вариантов и непустой корректный набор индексов', () => {
  for (const q of data) {
    assert.ok(q.q && q.q.length >= 8, `#${q.n}: пустая формулировка`);
    assert.ok(q.options.length >= 2, `#${q.n}: вариантов ${q.options.length}`);
    assert.ok(q.correct.length >= 1, `#${q.n}: нет верных`);
    assert.equal(new Set(q.correct).size, q.correct.length, `#${q.n}: повтор индекса`);
    for (const i of q.correct) assert.ok(Number.isInteger(i) && i >= 0 && i < q.options.length, `#${q.n}: индекс ${i}`);
    assert.ok(q.correct.length <= q.options.length);
  }
});

test('КМ-2: число верных ответов равно числу галочек в PDF (562) — ни одна отметка не потеряна и не продублирована', () => {
  const total = data.reduce((s, q) => s + q.correct.length, 0);
  assert.equal(total, 562);
});

test('КМ-2: все картинки (рисунки и варианты) существуют на диске', () => {
  let n = 0;
  for (const q of data) {
    for (const f of q.figures ?? []) { assert.ok(existsSync(path(f)), `#${q.n}: нет ${f}`); n++; }
    for (const o of q.options) if (typeof o !== 'string') { assert.ok(existsSync(path(o.img)), `#${q.n}: нет ${o.img}`); n++; }
  }
  assert.ok(n >= 95, `картинок: ${n}`);
});

test('КМ-2: тексты чистые — нет остатков склейки, пустых вариантов, незакрытых индексов, двойных пробелов', () => {
  for (const q of data) {
    const texts = [q.q, ...q.options.map(textOf).filter((t) => t !== null)];
    for (const t of texts) {
      assert.ok(t.trim().length > 0, `#${q.n}: пустой вариант`);
      assert.doesNotMatch(t, /\s{2,}/, `#${q.n}: двойной пробел «${t.slice(0, 60)}»`);
      assert.doesNotMatch(t, /\{\{|\}\}/, `#${q.n}: остаток плейсхолдера`);
      assert.doesNotMatch(t, /123xyz/i, `#${q.n}: водяной знак в тексте`);
      // разметка индексов _{…} / ^{…} должна быть корректной (одиночные скобки из исходных формул не в счёт)
      const rest = t.replace(/[_^]\{[^{}]*\}/g, '');
      assert.doesNotMatch(rest, /[_^]\{/, `#${q.n}: незакрытый индекс в «${t}»`);
    }
  }
});

test('КМ-2: известные слипшиеся слова исправлены (регрессия расклейки)', () => {
  const blob = data.map((q) => [q.q, ...q.options.map(textOf)].join(' ')).join('\n');
  for (const bad of ['верныйзнак', 'Вкаком', 'припреобладании', 'воздушныхлиний', 'увеличитьсятак', 'выберитенесколько', 'графиканагрузки', 'потерьэлектроэнергии'])
    assert.ok(!blob.includes(bad), `осталось «${bad}»`);
  const low = blob.toLowerCase();
  for (const good of ['при преобладании', 'в каком', 'воздушных линий', 'графика нагрузки', 'как правило'])
    assert.ok(low.includes(good), `нет «${good}»`);
  for (const good of ['НН автотрансформатора', 'России', 'РПН'])
    assert.ok(blob.includes(good), `нет «${good}»`);
});

test('КМ-2: известные структурные случаи (регрессия склейки вариантов)', () => {
  const q = (n) => data.find((x) => x.n === n);
  // #6: четыре отдельных варианта, верны 2-й и 4-й
  assert.equal(q(6).options.length, 4);
  assert.deepEqual(q(6).correct, [1, 3]);
  // #292: перенос внутри варианта склеен — четыре варианта, верен первый
  assert.equal(q(292).options.length, 4);
  assert.match(q(292).options[1], /расчетной схемы замещения трансформатора в режиме/);
  // #417/#418: длинные варианты, разрезанные в исходнике, собраны; галочка с хвоста относится ко всему варианту
  assert.ok(q(417).options.length <= 6 && q(418).options.length <= 6);
  assert.ok(q(417).options.some((o) => /действиями дежурного персонала/.test(o)));
  // индексы
  assert.ok(data.some((x) => /P_\{нм\}/.test(x.q + x.options.join(' '))));
});

test('КМ-2: вопросы с пометкой ⚠ имеют объяснение; разделы по 30; исключённые не попали в набор', () => {
  for (const q of data) {
    if (q.uncertain) assert.ok(q.note && q.note.length > 20, `#${q.n}: нет note`);
    assert.equal(q.section, Math.floor((q.n - 1) / 30) + 1);
    assert.match(q.section_title, /^Вопросы \d+–\d+$/);
  }
  for (const n of [5, 61, 77, 78, 253, 254, 387, 388, 389, 390]) assert.ok(!data.some((q) => q.n === n), `#${n} не должен быть в наборе`);
  assert.equal(data.filter((q) => q.uncertain).length, 11);
});
