// Модуль «Расчёт режима»: тесты на формулы, слабые места, пошаговый разбор с
// диагностикой ошибок. Вся математика — в calc/* (чистые функции); здесь только UI.
import { checkAnswer, recordResult, weakSpots, selectByMisconceptions, scoreSession, flattenBank, shuffled } from './calc/quiz-bank.js';
import { generateVariant } from './calc/variants.js';
import { buildSteps, attachQuestionIds } from './calc/steps.js';
import { diagnose } from './calc/diagnose.js';
import { QUANTITIES } from './calc/quantities.js';
import { MISCONCEPTIONS } from './calc/misconceptions.js';

const LS_KEY = 'seti_fq_v1';
const App = () => window.SetiApp;
const root = document.getElementById('calcRoot');

/* ───────── утилиты ───────── */
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const btn = (label, cls, onClick) => {
  const b = el('button', cls, label);
  b.type = 'button';
  b.onclick = onClick;
  return b;
};

/** Текст с формулами $…$ → DOM (KaTeX, если загрузился). */
function math(text) {
  const frag = document.createDocumentFragment();
  String(text).split('$').forEach((seg, i) => {
    if (i % 2 === 0) return seg && frag.append(seg);
    const s = el('span', 'tex');
    if (window.katex) {
      try { window.katex.render(seg, s, { throwOnError: false }); } catch { s.textContent = seg; }
    } else { s.textContent = seg; s.classList.add('tex-raw'); }
    frag.append(s);
  });
  return frag;
}
/** Отдельная формула (LaTeX без $) — блоком. */
function texBlock(latex, cls = 'fq-formula') {
  const d = el('div', cls);
  if (window.katex) {
    try { window.katex.render(latex, d, { displayMode: true, throwOnError: false }); return d; } catch { /* fallthrough */ }
  }
  d.textContent = latex;
  d.classList.add('tex-raw');
  return d;
}
const mathEl = (tag, cls, text) => { const e = el(tag, cls); e.append(math(text)); return e; };

/* ───────── состояние и хранилище ───────── */
let store = loadStore();
function loadStore() {
  try { return { misc: {}, scores: {}, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }; } catch { return { misc: {}, scores: {} }; }
}
function saveStore() { try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch { /* приватный режим */ } }

let DATA = null; // { fixture, tests, all }
const S = { view: 'menu', run: null, solution: null };

async function loadData() {
  if (DATA) return DATA;
  const j = async (u) => (await fetch(u)).json();
  const [fixture, t1, t2, t3] = await Promise.all([
    j('fixtures/km2_reference.json'), j('content/formula-quiz/test1.json'), j('content/formula-quiz/test2.json'), j('content/formula-quiz/test3.json'),
  ]);
  const tests = [t1, t2, t3];
  DATA = { fixture, tests, all: flattenBank(tests) };
  return DATA;
}

/* ───────── навигация ───────── */
async function open() {
  App().showScreen('calc');
  root.replaceChildren(el('p', 'fq-muted', 'Загрузка…'));
  try { await loadData(); } catch (e) {
    root.replaceChildren(el('p', 'fq-muted', 'Не удалось загрузить материалы модуля (content/, fixtures/).'));
    return;
  }
  go('menu');
}
function go(view) { S.view = view; render(); window.scrollTo(0, 0); }
function render() {
  const v = { menu: viewMenu, run: viewRun, result: viewResult, solution: viewSolution }[S.view];
  root.replaceChildren(v());
}
const header = (title, onBack) => {
  const h = el('div', 'fq-head');
  h.append(btn('←', 'icon-btn', onBack ?? (() => App().renderHome())), el('h2', null, title));
  return h;
};

/* ───────── МЕНЮ ───────── */
function viewMenu() {
  const wrap = el('div', 'fq');
  wrap.append(header('Расчёт режима'));
  wrap.append(el('p', 'fq-lead', 'Три теста на понимание формул, разбор расчётной задачи и диагностика: приложение не просто говорит «неверно», а называет конкретную ошибку.'));

  // тесты
  wrap.append(el('h3', 'section-title', 'Тесты на формулы'));
  for (const t of DATA.tests) {
    const c = el('button', 'fq-card fq-test');
    c.type = 'button';
    const sc = store.scores[t.id];
    c.append(el('b', null, t.title), el('span', 'fq-muted', t.description),
      el('span', 'fq-meta', `${t.questions.length} вопросов` + (sc ? ` · лучший результат: ${sc.correct}/${sc.total}` : '')));
    c.onclick = () => startRun(shuffled(t.questions), { title: t.title, testId: t.id });
    wrap.append(c);
  }
  const allBtn = btn('Все вопросы вперемешку', 'ghost-btn', () => startRun(shuffled(DATA.all).slice(0, 20), { title: 'Смешанный тест (20)' }));
  wrap.append(allBtn);

  // слабые места
  wrap.append(el('h3', 'section-title', 'Слабые места'));
  const spots = weakSpots(store.misc, 6);
  const card = el('div', 'fq-card');
  if (!spots.length) card.append(el('span', 'fq-muted', 'Пока нет данных: пройдите любой тест — здесь появятся ошибки, которые вы допускаете чаще всего.'));
  else {
    spots.forEach((w) => {
      const r = el('div', 'fq-spot');
      r.append(el('span', 'fq-spot-title', w.title), el('span', 'fq-spot-n', `×${w.wrong}`));
      card.append(r);
    });
    card.append(btn('Повторить только эти вопросы', 'action-btn', () => trainKeys(spots.map((w) => w.key))));
  }
  wrap.append(card);

  // разбор задачи
  wrap.append(el('h3', 'section-title', 'Разбор задачи'));
  const sol = el('div', 'fq-card');
  sol.append(el('span', 'fq-muted', 'Пошаговое решение с формулами, подстановкой, типовыми ошибками и таблицей сходимости.'));
  const seg = el('div', 'fq-seg');
  let mode = 'ref';
  const opts = [['ref', 'Эталон (ВЛ + 2×ТРДН)'], ['A', 'Случайная A'], ['B', 'Случайная B (2 линии)']];
  opts.forEach(([k, label]) => {
    const b = btn(label, 'fq-seg-btn' + (k === mode ? ' on' : ''), () => { mode = k; seg.querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', opts[i][0] === k)); });
    seg.append(b);
  });
  sol.append(seg);
  sol.append(btn('Показать решение', 'action-btn', () => openSolution(mode)));
  wrap.append(sol);

  wrap.append(btn('Сбросить статистику модуля', 'ghost-btn', () => {
    if (confirm('Сбросить статистику ошибок и результаты тестов?')) { store = { misc: {}, scores: {} }; saveStore(); render(); }
  }));
  return wrap;
}

/* ───────── ПРОХОЖДЕНИЕ ТЕСТА ───────── */
function startRun(list, meta) {
  if (!list.length) { App().alertMsg('Нет вопросов для этого режима.'); return; }
  S.run = { list, meta, i: 0, results: [], answered: false, resp: null, order: null };
  go('run');
}
function trainKeys(keys) {
  const list = shuffled(selectByMisconceptions(DATA.all, keys)).slice(0, 15);
  startRun(list, { title: 'Тренировка слабых мест' });
}

const TYPE_LABEL = {
  formula_choice: 'выбор формулы', spot_the_error: 'найди ошибку', micro_calc: 'расчёт числом', units_check: 'единицы',
  effect_direction: 'к чему приведёт ошибка', step_order: 'порядок шагов', concept: 'понимание',
};

function viewRun() {
  const R = S.run;
  const q = R.list[R.i];
  const wrap = el('div', 'fq');
  const top = el('div', 'fq-run-top');
  top.append(btn('✕', 'icon-btn', () => go('menu')));
  const prog = el('div', 'progress');
  const bar = el('div', 'progress-bar');
  bar.style.width = `${(R.i / R.list.length) * 100}%`;
  prog.append(bar);
  top.append(prog, el('div', 'counter', `${R.i + 1}/${R.list.length}`));
  wrap.append(top);

  const meta = el('div', 'qmeta');
  meta.append(el('span', 'chip', TYPE_LABEL[q.type]), el('span', 'chip', '★'.repeat(q.difficulty) + '☆'.repeat(3 - q.difficulty)));
  wrap.append(meta);
  wrap.append(mathEl('h2', 'qtext', q.stem));

  const body = el('div', 'options');
  const feedback = el('div', 'explain hidden');
  const actions = el('div', 'fq-actions');
  wrap.append(body, feedback, actions);

  const finish = (result, lockFn) => {
    R.answered = true;
    R.results.push({ question: q, result });
    store.misc = recordResult(store.misc, q, result);
    saveStore();
    App().haptic(result.correct ? 'ok' : 'bad');
    lockFn?.();
    feedback.className = `explain ${result.correct ? 'ok' : 'bad'}`;
    feedback.replaceChildren();
    feedback.append(mathEl('div', null, (result.correct ? '✓ ' : '✗ ') + result.feedback));
    const ex = el('div', 'fq-expl');
    ex.append(el('b', null, 'Разбор: '), math(q.explanation));
    feedback.append(ex);
    actions.replaceChildren(btn(R.i + 1 >= R.list.length ? 'Завершить' : 'Далее', 'action-btn next', next));
  };
  const next = () => {
    if (R.i + 1 >= R.list.length) { finishRun(); return; }
    R.i++; R.answered = false; go('run');
  };

  if (['formula_choice', 'spot_the_error', 'units_check', 'effect_direction', 'concept'].includes(q.type)) {
    let chosen = null;
    const check = btn('Проверить', 'action-btn', () => {
      if (!chosen) return;
      const r = checkAnswer(q, chosen);
      finish(r, () => {
        body.querySelectorAll('.opt').forEach((n) => {
          n.classList.add('locked'); n.onclick = null; n.classList.remove('selected');
          const o = q.options.find((x) => x.id === n.dataset.id);
          if (o.correct) n.classList.add('correct'); else if (n.dataset.id === chosen) n.classList.add('wrong');
        });
      });
    });
    check.disabled = true;
    actions.append(check);
    shuffled(q.options).forEach((o) => {
      const n = el('div', 'opt');
      n.dataset.id = o.id;
      n.append(el('div', 'mark', '●'), mathEl('div', 'otext', o.text));
      n.onclick = () => {
        if (R.answered) return;
        chosen = o.id;
        body.querySelectorAll('.opt').forEach((x) => x.classList.toggle('selected', x === n));
        check.disabled = false;
      };
      body.append(n);
    });
  } else if (q.type === 'micro_calc') {
    const row = el('div', 'fq-input-row');
    const inp = el('input', 'fq-input');
    inp.type = 'text'; inp.inputMode = 'decimal'; inp.placeholder = `Ответ, ${q.answer.unit || 'число'}`; inp.autocomplete = 'off';
    row.append(inp, el('span', 'fq-unit', q.answer.unit));
    body.append(row);
    const check = btn('Проверить', 'action-btn', () => {
      const v = Number(inp.value.trim().replace(',', '.'));
      if (!Number.isFinite(v) || inp.value.trim() === '') { inp.focus(); return; }
      inp.disabled = true;
      finish(checkAnswer(q, v, { variant: DATA.fixture.variant }));
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') check.click(); });
    actions.append(check);
    setTimeout(() => inp.focus({ preventScroll: true }), 50);
  } else if (q.type === 'step_order') {
    R.order = shuffled(q.items);
    const list = el('div', 'fq-order');
    const draw = () => {
      list.replaceChildren();
      R.order.forEach((it, i) => {
        const row = el('div', 'fq-order-row');
        row.append(el('span', 'fq-order-n', String(i + 1)), mathEl('span', 'fq-order-text', it.text));
        if (!R.answered) {
          const up = btn('↑', 'icon-btn', () => { if (i > 0) { [R.order[i - 1], R.order[i]] = [R.order[i], R.order[i - 1]]; draw(); } });
          const dn = btn('↓', 'icon-btn', () => { if (i < R.order.length - 1) { [R.order[i + 1], R.order[i]] = [R.order[i], R.order[i + 1]]; draw(); } });
          row.append(up, dn);
        }
        list.append(row);
      });
    };
    draw();
    body.append(list);
    actions.append(btn('Проверить', 'action-btn', () => {
      finish(checkAnswer(q, R.order.map((x) => x.id)), () => {
        list.querySelectorAll('.fq-order-row').forEach((row, i) => row.classList.add(R.order[i].id === q.answer.order[i] ? 'ok' : 'bad'));
      });
      draw();
    }));
  }
  return wrap;
}

function finishRun() {
  const R = S.run;
  const sc = scoreSession(R.results);
  if (R.meta.testId) {
    const prev = store.scores[R.meta.testId];
    if (!prev || sc.correct / sc.total >= prev.correct / prev.total) store.scores[R.meta.testId] = { correct: sc.correct, total: sc.total };
    saveStore();
  }
  R.score = sc;
  go('result');
}

/* ───────── РЕЗУЛЬТАТ: слабые места сессии ───────── */
function viewResult() {
  const R = S.run;
  const { correct, total, wrongKeys } = R.score;
  const pct = Math.round((correct / total) * 100);
  const wrap = el('div', 'fq');
  wrap.append(header('Результат', () => go('menu')));
  const card = el('div', 'fq-card fq-score');
  card.append(el('div', 'fq-score-n', `${correct} / ${total}`), el('div', 'fq-muted', `${pct}% верных · ${R.meta.title}`));
  wrap.append(card);

  const keys = Object.entries(wrongKeys).sort((a, b) => b[1] - a[1]);
  wrap.append(el('h3', 'section-title', 'Слабые места этой сессии'));
  const sp = el('div', 'fq-card');
  if (!keys.length) sp.append(el('span', 'fq-muted', correct === total ? 'Без ошибок — отлично! 🎉' : 'Конкретных типовых ошибок не выявлено.'));
  keys.forEach(([k, n]) => {
    const m = MISCONCEPTIONS[k];
    const r = el('div', 'fq-spot');
    r.append(el('span', 'fq-spot-title', m.title), el('span', 'fq-spot-n', `×${n}`));
    sp.append(r);
    sp.append(el('div', 'fq-muted fq-spot-desc', `Вы ${m.description}.`));
  });
  wrap.append(sp);

  const wrongQs = R.results.filter((x) => !x.result.correct).map((x) => x.question);
  const acts = el('div', 'fq-actions');
  if (wrongQs.length) acts.append(btn('Повторить неверные', 'action-btn', () => startRun(shuffled(wrongQs), { title: 'Разбор ошибок' })));
  if (keys.length) acts.append(btn('Тренировать эти слабые места', 'ghost-btn', () => trainKeys(keys.map(([k]) => k))));
  acts.append(btn('В меню модуля', 'ghost-btn', () => go('menu')));
  wrap.append(acts);
  return wrap;
}

/* ───────── ПОШАГОВЫЙ РАЗБОР ───────── */
function openSolution(mode) {
  const variant = mode === 'ref' ? DATA.fixture.variant : generateVariant(Math.floor(Math.random() * 100000) + 1, { type: mode });
  const { steps, solution } = buildSteps(variant);
  attachQuestionIds(steps, DATA.all);
  S.solution = { variant, steps, solution, mode };
  go('solution');
}

function groupSteps(steps) {
  const groups = [];
  const push = (title, open = false) => { const g = { title, open, steps: [] }; groups.push(g); return g; };
  let cur = null;
  for (const s of steps) {
    let t;
    const m = s.id.match(/^iter(\d+)\./);
    if (s.id === 'scheme') t = 'Схема замещения';
    else if (m) t = `Итерация ${m[1]}`;
    else if (['convergence', 'U_nn', 'losses'].includes(s.id)) t = 'Итоги';
    else t = 'Параметры схемы замещения';
    if (!cur || cur.title !== t) cur = push(t, t === 'Схема замещения');
    cur.steps.push(s);
  }
  return groups;
}

function variantSummary(v) {
  const w = (x, L, n) => `${x.name} (D=${x.D_m} м), L=${L} км, ${n} ц.`;
  if (v.type === 'A') {
    const t = v.transformer;
    return `ВЛ ${v.U_nom} кВ: ${w(v.wire, v.L, v.n_line)}; ${t.n}×${t.name}; P₁ = ${v.S_start.P} МВт, tgφ = ${v.S_start.tgphi}; U за обмотками = ${v.U_end} кВ.`;
  }
  return `Две линии ${v.U_nom} кВ: ${w(v.lines[0].wire, v.lines[0].L, v.lines[0].n)}; ${w(v.lines[1].wire, v.lines[1].L, v.lines[1].n)}; нагрузка узла 2: ${v.mid_load.P} МВт (tgφ ${v.mid_load.tgphi}); P₁ = ${v.S_start.P} МВт; U в конце = ${v.U_end} кВ.`;
}

function convergenceTable(sol) {
  const its = sol.iterations.slice(0, 6);
  const t = el('table', 'fq-table');
  const head = el('tr');
  head.append(el('th', null, 'Величина'));
  its.forEach((it) => head.append(el('th', null, `Итер. ${it.iter}`)));
  t.append(head);
  const f2 = (x) => x.toFixed(2);
  const S = (s) => `${s.P.toFixed(2)} ${s.Q < 0 ? '−' : '+'} j${Math.abs(s.Q).toFixed(2)}`;
  const row = (label, get) => { const r = el('tr'); r.append(el('td', null, label)); its.forEach((it) => r.append(el('td', null, get(it)))); t.append(r); };
  const first = its[0];
  first.nodes.forEach((nd, k) => { if (nd.Qc > 0) row(`Q_c${nd.id}, Мвар`, (it) => f2(it.nodes[k].Qc)); if (k < first.branches.length) row(`ΔS ${first.branches[k].id}, МВА`, (it) => S(it.branches[k].dS)); });
  row('S конца, МВА', (it) => S(it.S_end));
  first.U.slice(0, -1).forEach((_, k) => row(`U${k + 1}, кВ`, (it) => it.U[k].toFixed(1)));
  row('max|ΔU|, кВ', (it) => it.maxDelta.toFixed(3));
  return t;
}

function stepCard(step, variant) {
  const c = el('div', 'fq-step');
  c.append(el('div', 'fq-step-title', step.title));
  c.append(texBlock(step.formula));
  c.append(texBlock(step.substitution, 'fq-formula fq-subst'));
  const res = el('div', 'fq-step-result');
  res.append(el('b', null, '= '), math(step.result.text));
  c.append(res);
  c.append(mathEl('p', 'fq-why', step.why));
  if (step.pitfall) c.append(mathEl('p', 'fq-pitfall', '⚠ Типовые ошибки: ' + step.pitfall));

  // проверка своего числа → diagnose
  if (step.checks.length) {
    const box = el('div', 'fq-check');
    const sel = el('select', 'fq-select');
    step.checks.forEach((ch, i) => {
      const q = QUANTITIES[ch.quantity];
      const o = el('option', null, `${q.label}${q.unit ? ', ' + q.unit : ''}`);
      o.value = String(i);
      sel.append(o);
    });
    const inp = el('input', 'fq-input');
    inp.type = 'text'; inp.inputMode = 'decimal'; inp.placeholder = 'Ваш результат'; inp.autocomplete = 'off';
    const out = el('div', 'fq-diag hidden');
    const go = btn('Проверить', 'ghost-btn fq-check-btn', () => {
      const v = Number(inp.value.trim().replace(',', '.'));
      if (!Number.isFinite(v) || !inp.value.trim()) { inp.focus(); return; }
      const ch = step.checks[Number(sel.value)];
      const d = diagnose(ch.quantity, v, variant, { iteration: ch.iteration ?? 1 });
      out.className = `fq-diag ${d.status === 'correct' ? 'ok' : 'bad'}`;
      out.replaceChildren();
      const q = QUANTITIES[ch.quantity];
      const shown = d.correctValue.toFixed(q.digits ?? 2);
      if (d.status === 'correct') out.append(`✓ Верно (${shown}${q.unit ? ' ' + q.unit : ''}).`);
      else {
        out.append(el('div', null, '✗ ' + d.message));
        if (d.hint) out.append(el('div', 'fq-muted', d.hint));
        out.append(el('div', 'fq-muted', `Верное значение: ${shown}${q.unit ? ' ' + q.unit : ''}.`));
        if (d.matches.length) out.append(btn('Потренировать эту ошибку', 'ghost-btn', () => trainKeys(d.matches.map((m) => m.key))));
      }
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
    if (step.checks.length === 1) sel.classList.add('hidden');
    box.append(sel, inp, go, out);
    c.append(box);
  }
  if (step.check_question_ids.length) {
    c.append(btn(`Вопросы по шагу (${step.check_question_ids.length})`, 'fq-link', () => {
      const ids = new Set(step.check_question_ids);
      startRun(shuffled(DATA.all.filter((q) => ids.has(q.id))), { title: `Вопросы по шагу: ${step.title}` });
    }));
  }
  return c;
}

function viewSolution() {
  const { variant, steps, solution, mode } = S.solution;
  const wrap = el('div', 'fq');
  wrap.append(header('Разбор задачи', () => go('menu')));
  const info = el('div', 'fq-card');
  info.append(el('b', null, mode === 'ref' ? 'Эталонная задача' : `Вариант ${variant.type} (seed ${variant.seed})`), el('p', 'fq-muted', variantSummary(variant)));
  const r = solution.result;
  info.append(el('p', null, `Итог: U₁ = ${r.U[0].toFixed(1)} кВ, S на конце = ${r.S_end.P.toFixed(2)} + j${r.S_end.Q.toFixed(2)} МВА, потери ${r.loss_total_P.toFixed(2)} МВт (${r.loss_total_pct.toFixed(1)} %). ${solution.converged ? `Сошлось за ${solution.iterations.length} итераций.` : ''}`));
  if (mode !== 'ref') info.append(btn('Другой вариант', 'ghost-btn', () => openSolution(mode)));
  wrap.append(info);

  wrap.append(el('h3', 'section-title', 'Таблица сходимости'));
  const tb = el('div', 'fq-card fq-scroll-x');
  tb.append(convergenceTable(solution));
  wrap.append(tb);

  wrap.append(el('h3', 'section-title', 'Решение по шагам'));
  wrap.append(el('p', 'fq-muted', 'В шагах со значком проверки введите своё число — приложение назовёт конкретную ошибку.'));
  for (const g of groupSteps(steps)) {
    const d = el('details', 'fq-group');
    if (g.open) d.open = true;
    d.append(el('summary', null, `${g.title} · ${g.steps.length}`));
    g.steps.forEach((s) => d.append(stepCard(s, variant)));
    wrap.append(d);
  }
  return wrap;
}

/* ───────── подключение к главному экрану ───────── */
const homeBtn = document.querySelector('.mode-btn[data-mode="calc"]');
if (homeBtn) homeBtn.addEventListener('click', open);
