/**
 * Пошаговое решение: массив шагов, который рендерит UI.
 * Шаги ГЕНЕРИРУЮТСЯ из журнала решателя (числа берутся оттуда) — разбор не
 * дублирует формулы движка и не хранит чисел эталона.
 *
 * Шаг:
 *   id, kind, title
 *   formula        — LaTeX
 *   substitution   — та же формула с подставленными числами (LaTeX)
 *   result         — { text, value?, unit? }
 *   why            — зачем этот шаг и откуда величины
 *   pitfall        — типовая ошибка именно на этом шаге (из реестра ошибок)
 *   pitfall_keys   — ключи этих ошибок (для ссылок на вопросы)
 *   checks         — [{ quantity, iteration? }] — какие величины шага можно проверить
 *                    через diagnose()
 *   check_question_ids — id вопросов банка с related_step == kind
 *                    (заполняется attachQuestionIds)
 */
import { solveVariant } from './run.js';
import { nnVoltage } from './regime.js';
import { fmt, fmtS } from './util.js';
import { misconceptionsForKind } from './misconceptions.js';

const pitfallFor = (kind) => {
  const list = misconceptionsForKind(kind);
  if (!list.length) return { pitfall: '', pitfall_keys: [] };
  return { pitfall: list.map((m) => m.title).join('; ') + '.', pitfall_keys: list.map((m) => m.key) };
};

const WHY = {
  scheme:
    'Схема замещения — цепочка элементов от шин источника к нагрузке. Продольные элементы (R + jX) — в ветвях, поперечные (B/2 линии, потери х.х. трансформаторов) — в узлах: ток заряда и ток х.х. текут «на землю», а не вдоль ветви.',
  lg_ratio: 'Логарифм отношения среднегеометрического расстояния между фазами к радиусу провода определяет x₀ и b₀. D и r — в одних единицах, r — радиус (d/2).',
  x0: 'Удельное индуктивное сопротивление провода, зависящее от геометрии фаз.',
  b0: 'Удельная ёмкостная проводимость провода; чем ближе фазы к проводу (меньше lg), тем больше b₀.',
  R_line: 'Для n параллельных цепей сопротивление уменьшается в n раз.',
  X_line: 'Так же, как R: параллельные цепи делят индуктивное сопротивление на n.',
  B_line: 'Проводимости параллельных цепей складываются. В П-образной схеме половина B идёт в каждый конец линии.',
  R_T: 'Активное сопротивление обмоток n параллельных трансформаторов, приведённое к стороне ВН (U_вн = 230 кВ).',
  X_T: 'Реактивное сопротивление из напряжения короткого замыкания u_к (в процентах!), приведённое к стороне ВН.',
  dP_x_total: 'Потери х.х. (в стали) есть у каждого трансформатора независимо — они складываются, и сидят в узле, а не в ветви.',
  dQ_x_total: 'Реактивная мощность намагничивания: I_x от ПОЛНОЙ номинальной мощности; сидит в узле.',
  Q1: 'Реактивная мощность источника из заданного коэффициента реактивной мощности.',
  Qc: 'Ёмкость линии генерирует реактивную мощность: она прибавляется к Q в узле. Напряжение — с предыдущей итерации.',
  dS_line: 'Потери в продольной ветви: квадраты — и в числителе (P², Q²), и в знаменателе (U²). P, Q — поток в начале ветви (после учёта узла), U — напряжение этого узла с предыдущей итерации.',
  dS_T: 'Потери в обмотках трансформаторов (нагрузочные): считаются по потоку на входе в трансформатор.',
  S_end: 'Прямой ход: от источника к нагрузке потери ВЫЧИТАЮТСЯ, зарядная мощность прибавляется.',
  dU: 'Обратный ход: от известного напряжения в конце ветви. Продольная составляющая dU — вдоль вектора напряжения, поперечная δU — перпендикулярно. P, Q — поток в КОНЦЕ ветви.',
  U_modulus: 'Модуль напряжения в начале ветви: гипотенуза треугольника из (U_кон + dU) и δU.',
  convergence: 'Потери и Q_c зависят от U, а U — от потерь, поэтому напряжения уточняют итерациями. Стоп: max|U_k − U_(k−1)| меньше заданной точности.',
  U_nn: 'Напряжение на стороне НН — пересчёт через коэффициент трансформации (без РПН он фиксирован).',
  losses: 'Суммарные потери активной мощности: нагрузочные в ветвях + потери х.х. в узлах.',
};

/**
 * @param {object} variant
 * @param {{iterations?:number}} [opts]  сколько итераций расписывать (по умолчанию 3)
 * @returns {{steps:object[], solution:object, variant:object}}
 */
export function buildSteps(variant, { iterations = 3 } = {}) {
  const { net, sol } = solveVariant(variant);
  const { meta } = net;
  const steps = [];
  const add = (s) => {
    steps.push({ checks: [], check_question_ids: [], ...pitfallFor(s.kind), ...s });
  };

  // ── шаг 0: разбор схемы замещения ──
  const isA = variant.type === 'A';
  const nLine = meta.lines.map((l) => l.n);
  add({
    id: 'scheme',
    kind: 'scheme',
    title: 'Разбор схемы замещения',
    formula: isA
      ? String.raw`\underbrace{\tfrac{B}{2}}_{\text{шины 1}}\;\to\; R_л+jX_л \;\to\; \underbrace{\tfrac{B}{2},\;\Delta P_x+j\Delta Q_x}_{\text{узел 2}} \;\to\; R_T+jX_T \;\to\; U_{\text{зад}}`
      : String.raw`\underbrace{\tfrac{B_1}{2}}_{\text{узел 1}}\to R_1+jX_1 \to \underbrace{\tfrac{B_1+B_2}{2},\,S_{\text{нагр}}}_{\text{узел 2}} \to R_2+jX_2 \to \underbrace{\tfrac{B_2}{2}}_{\text{узел 3}}`,
    substitution: isA
      ? `ВЛ: ${nLine[0]} цепи → R, X делим на ${nLine[0]}, B умножаем на ${nLine[0]}; трансформаторов ${meta.transformer.n}: R_T, X_T делим на ${meta.transformer.n}, ΔP_x, ΔQ_x умножаем на ${meta.transformer.n}.`
      : `Линия 1: n = ${nLine[0]}; линия 2: n = ${nLine[1]}; в узле 2 сидят B/2 обеих линий и узловая нагрузка.`,
    result: { text: isA ? 'Порядок: B/2 (шины 1) → ВЛ → узел 2 (B/2 + потери х.х.) → трансформаторы → точка с заданным U → нагрузка' : 'Порядок: узел 1 → линия 1 → узел 2 (нагрузка) → линия 2 → узел 3' },
    why: WHY.scheme,
  });

  // ── параметры схемы замещения ──
  meta.lines.forEach((L, j) => {
    const sfx = j === 0 ? '' : `_${j + 1}`;
    const tag = meta.lines.length > 1 ? ` (линия ${j + 1})` : '';
    const q = (id) => (j === 0 ? [{ quantity: id }] : []);
    add({
      id: `lg_ratio${sfx}`, kind: 'lg_ratio', title: `lg(D_ср/r)${tag}`,
      formula: String.raw`\lg\dfrac{D_{ср}}{r},\quad r=\dfrac{d}{2}`,
      substitution: String.raw`\lg\dfrac{${fmt(L.D, 0)}}{${fmt(L.r, 1)}}=${fmt(L.lg, 3)}`,
      result: { value: L.lg, unit: '', text: fmt(L.lg, 3) }, why: WHY.lg_ratio, checks: q('lg_ratio'),
    });
    add({
      id: `x0${sfx}`, kind: 'x0', title: `Удельное индуктивное сопротивление x₀${tag}`,
      formula: String.raw`x_0=0.1445\,\lg\dfrac{D_{ср}}{r}+0.0157`,
      substitution: String.raw`x_0=0.1445\cdot ${fmt(L.lg, 3)}+0.0157=${fmt(L.x0, 3)}`,
      result: { value: L.x0, unit: 'Ом/км', text: `${fmt(L.x0, 3)} Ом/км` }, why: WHY.x0, checks: q('x0'),
    });
    add({
      id: `b0${sfx}`, kind: 'b0', title: `Удельная ёмкостная проводимость b₀${tag}`,
      formula: String.raw`b_0=\dfrac{7.58\cdot10^{-6}}{\lg\,(D_{ср}/r)}`,
      substitution: String.raw`b_0=\dfrac{7.58\cdot10^{-6}}{${fmt(L.lg, 3)}}=${fmt(L.b0 * 1e6, 3)}\cdot10^{-6}`,
      result: { value: L.b0, unit: 'См/км', text: `${fmt(L.b0 * 1e6, 3)}·10⁻⁶ См/км` }, why: WHY.b0, checks: q('b0'),
    });
    add({
      id: `R_line${sfx}`, kind: 'R_line', title: `Активное сопротивление линии R_л${tag}`,
      formula: String.raw`R_л=\dfrac{R_0\,L}{n}`,
      substitution: String.raw`R_л=\dfrac{${fmt(L.R0, 3)}\cdot ${fmt(L.L, 0)}}{${L.n}}=${fmt(L.R, 2)}`,
      result: { value: L.R, unit: 'Ом', text: `${fmt(L.R, 2)} Ом` }, why: WHY.R_line, checks: q('R_line'),
    });
    add({
      id: `X_line${sfx}`, kind: 'X_line', title: `Индуктивное сопротивление линии X_л${tag}`,
      formula: String.raw`X_л=\dfrac{x_0\,L}{n}`,
      substitution: String.raw`X_л=\dfrac{${fmt(L.x0, 3)}\cdot ${fmt(L.L, 0)}}{${L.n}}=${fmt(L.X, 2)}`,
      result: { value: L.X, unit: 'Ом', text: `${fmt(L.X, 2)} Ом` }, why: WHY.X_line, checks: q('X_line'),
    });
    add({
      id: `B_line${sfx}`, kind: 'B_line', title: `Ёмкостная проводимость линии B_л, B/2${tag}`,
      formula: String.raw`B_л=b_0\,L\,n,\qquad \dfrac{B_л}{2}\ \text{— в каждый конец}`,
      substitution: String.raw`B_л=${fmt(L.b0 * 1e6, 3)}\cdot10^{-6}\cdot ${fmt(L.L, 0)}\cdot ${L.n}=${fmt(L.B * 1e6, 1)}\cdot10^{-6},\quad \tfrac{B_л}{2}=${fmt(L.B_half * 1e6, 1)}\cdot10^{-6}`,
      result: { value: L.B_half, unit: 'См', text: `B/2 = ${fmt(L.B_half * 1e6, 1)} мкСм` }, why: WHY.B_line, checks: q('B_half'),
    });
  });
  if (isA) {
    const T = meta.transformer, t = T.t;
    add({
      id: 'R_T', kind: 'R_T', title: 'Активное сопротивление трансформаторов R_T',
      formula: String.raw`R_T=\dfrac{\Delta P_к\,U_{вн}^2}{S_{ном}^2\,n}`,
      substitution: String.raw`R_T=\dfrac{${fmt(T.dPk_MW, 3)}\cdot ${t.Uvn}^2}{${t.Sn}^2\cdot ${t.n}}=${fmt(T.R, 2)}`,
      result: { value: T.R, unit: 'Ом', text: `${fmt(T.R, 2)} Ом` }, why: WHY.R_T, checks: [{ quantity: 'R_T' }],
    });
    add({
      id: 'X_T', kind: 'X_T', title: 'Индуктивное сопротивление трансформаторов X_T',
      formula: String.raw`X_T=\dfrac{u_к\,U_{вн}^2}{100\,S_{ном}\,n}`,
      substitution: String.raw`X_T=\dfrac{${t.uk_pct}\cdot ${t.Uvn}^2}{100\cdot ${t.Sn}\cdot ${t.n}}=${fmt(T.X, 2)}`,
      result: { value: T.X, unit: 'Ом', text: `${fmt(T.X, 2)} Ом` }, why: WHY.X_T, checks: [{ quantity: 'X_T' }],
    });
    add({
      id: 'dP_x_total', kind: 'dP_x_total', title: 'Потери активной мощности х.х. ΔP_x',
      formula: String.raw`\Delta P_x=n\,\Delta P_{x1}`,
      substitution: String.raw`\Delta P_x=${t.n}\cdot ${fmt(T.dPx1_MW, 3)}=${fmt(T.dP_x, 3)}`,
      result: { value: T.dP_x, unit: 'МВт', text: `${fmt(T.dP_x, 3)} МВт` }, why: WHY.dP_x_total, checks: [{ quantity: 'dP_x_total' }],
    });
    add({
      id: 'dQ_x_total', kind: 'dQ_x_total', title: 'Потери реактивной мощности х.х. ΔQ_x',
      formula: String.raw`\Delta Q_x=\dfrac{n\,I_x\,S_{ном}}{100}`,
      substitution: String.raw`\Delta Q_x=\dfrac{${t.n}\cdot ${t.Ix_pct}\cdot ${t.Sn}}{100}=${fmt(T.dQ_x, 2)}`,
      result: { value: T.dQ_x, unit: 'Мвар', text: `${fmt(T.dQ_x, 2)} Мвар` }, why: WHY.dQ_x_total, checks: [{ quantity: 'dQ_x_total' }],
    });
  }
  add({
    id: 'Q1', kind: 'Q1', title: 'Реактивная мощность источника Q₁',
    formula: String.raw`Q_1=P_1\,\mathrm{tg}\varphi`,
    substitution: String.raw`Q_1=${fmt(meta.S_start.P, 1)}\cdot ${fmt(variant.S_start.tgphi, 3)}=${fmt(meta.S_start.Q, 2)}`,
    result: { value: meta.S_start.Q, unit: 'Мвар', text: `${fmt(meta.S_start.Q, 2)} Мвар` }, why: WHY.Q1, checks: [{ quantity: 'Q1' }],
  });

  // ── итерации ──
  const K = Math.min(iterations, sol.iterations.length);
  for (let i = 0; i < K; i++) {
    const it = sol.iterations[i];
    const n = i + 1;
    const T = (s) => `Итерация ${n} · ${s}`;
    // прямой ход
    // порядок по цепочке: узел 1 (Q_c) → ветвь 1-2 (ΔS) → узел 2 (Q_c) → ветвь 2-3 (ΔS) → …
    const addNode = (nd, k) => {
      if (!(net.nodes[k].shunt.B_half > 0)) return;
      const bh = net.nodes[k].shunt.B_half;
      add({
        id: `iter${n}.Qc.n${nd.id}`, kind: 'Qc', title: T(`Зарядная мощность Q_c в узле ${nd.id}`),
        formula: String.raw`Q_c=U^2\cdot\dfrac{B}{2}`,
        substitution: String.raw`Q_c=${fmt(nd.U_prev, 1)}^2\cdot ${fmt(bh * 1e6, 1)}\cdot10^{-6}=${fmt(nd.Qc, 2)}`,
        result: { value: nd.Qc, unit: 'Мвар', text: `${fmt(nd.Qc, 2)} Мвар` }, why: WHY.Qc + (n === 1 ? ' На первой итерации все напряжения принимаются равными номинальному.' : ''),
        checks: k < 3 ? [{ quantity: `Qc${k + 1}`, iteration: n }] : [],
      });
    };
    const addBranch = (b, k) => {
      const kind = b.kind === 'transformer' ? 'dS_T' : 'dS_line';
      const nth = net.branches.slice(0, k).filter((x) => x.kind === b.kind).length;
      const qP = b.kind === 'transformer' ? 'dS_T_P' : nth === 0 ? 'dS_line_P' : 'dS_line2_P';
      const qQ = qP.replace('_P', '_Q');
      add({
        id: `iter${n}.dS.b${k + 1}`, kind, title: T(`Потери мощности в ${b.kind === 'transformer' ? 'трансформаторах' : 'линии'} ${b.id}`),
        formula: String.raw`\Delta S=\dfrac{P^2+Q^2}{U^2}\,(R+jX)`,
        substitution: String.raw`\Delta S=\dfrac{${fmt(b.S_in.P, 2)}^2+${fmt(b.S_in.Q, 2)}^2}{${fmt(b.U_loss, 1)}^2}\,(${fmt(b.R, 2)}+j${fmt(b.X, 2)})=${fmt(b.dS.P, 2)}+j${fmt(b.dS.Q, 2)}`,
        result: { text: `ΔS = ${fmtS(b.dS)} МВА`, value: b.dS.P, unit: 'МВт' }, why: WHY[kind],
        checks: [{ quantity: qP, iteration: n }, { quantity: qQ, iteration: n }],
      });
    };
    it.nodes.forEach((nd, k) => {
      addNode(nd, k);
      if (k < it.branches.length) addBranch(it.branches[k], k);
    });
    add({
      id: `iter${n}.S_end`, kind: 'S_end', title: T('Мощность в конце цепочки S (нагрузка)'),
      formula: String.raw`S_{кон}=S_1+\sum jQ_c-\sum\Delta S_{\text{ветвей}}-\sum(\Delta P_x+j\Delta Q_x)-\sum S_{\text{нагр}}`,
      substitution: `S = ${fmtS(it.S_end)}`,
      result: { text: `S = ${fmtS(it.S_end)} МВА`, value: it.S_end.P, unit: 'МВт' }, why: WHY.S_end,
      checks: [{ quantity: 'S2_P', iteration: n }, { quantity: 'S2_Q', iteration: n }],
    });
    // обратный ход
    for (let k = it.branches.length - 1; k >= 0; k--) {
      const b = it.branches[k];
      const nth = net.branches.slice(0, k).filter((x) => x.kind === b.kind).length;
      const suffix = b.kind === 'transformer' ? 'T' : nth === 0 ? 'line' : null;
      add({
        id: `iter${n}.dU.b${k + 1}`, kind: 'dU', title: T(`Падение напряжения в ${b.kind === 'transformer' ? 'трансформаторах' : 'линии'} ${b.id}`),
        formula: String.raw`dU=\dfrac{P R+Q X}{U},\qquad \delta U=\dfrac{P X-Q R}{U}`,
        substitution: String.raw`dU=\dfrac{${fmt(b.S_out.P, 2)}\cdot ${fmt(b.R, 2)}+${fmt(b.S_out.Q, 2)}\cdot ${fmt(b.X, 2)}}{${fmt(b.U_to, 1)}}=${fmt(b.dU, 2)},\quad \delta U=${fmt(b.deltaU, 2)}`,
        result: { text: `dU = ${fmt(b.dU, 2)} кВ, δU = ${fmt(b.deltaU, 2)} кВ`, value: b.dU, unit: 'кВ' }, why: WHY.dU,
        checks: suffix ? [{ quantity: `dU_${suffix}`, iteration: n }, { quantity: `deltaU_${suffix}`, iteration: n }] : [],
      });
      add({
        id: `iter${n}.U.n${b.id.split('-')[0]}`, kind: 'U_modulus', title: T(`Напряжение в узле ${b.id.split('-')[0]}`),
        formula: String.raw`U=\sqrt{(U_{кон}+dU)^2+\delta U^2}`,
        substitution: String.raw`U=\sqrt{(${fmt(b.U_to, 1)}+${fmt(b.dU, 2)})^2+${fmt(b.deltaU, 2)}^2}=${fmt(b.U_from, 1)}`,
        result: { value: b.U_from, unit: 'кВ', text: `${fmt(b.U_from, 1)} кВ` }, why: WHY.U_modulus,
        checks: k <= 1 ? [{ quantity: `U${k + 1}`, iteration: n }] : [],
      });
    }
  }

  // ── сходимость, НН, потери ──
  add({
    id: 'convergence', kind: 'convergence', title: 'Сходимость итераций',
    formula: String.raw`\max_k\left|U_k^{(m)}-U_k^{(m-1)}\right|<\varepsilon`,
    substitution: sol.iterations.map((it) => `итер. ${it.iter}: max|ΔU| = ${fmt(it.maxDelta, 3)} кВ`).join('; '),
    result: { text: sol.converged ? `Сошлось за ${sol.iterations.length} итераций (ε = 0.01 кВ)` : 'Не сошлось за максимальное число итераций' },
    why: WHY.convergence,
  });
  if (isA) {
    const t = meta.transformer.t;
    const Unn = nnVoltage(variant.U_end, t.Uvn, t.Unn);
    add({
      id: 'U_nn', kind: 'U_nn', title: 'Напряжение на стороне НН',
      formula: String.raw`U_{нн}=U\cdot\dfrac{U_{нн.ном}}{U_{вн.ном}}`,
      substitution: String.raw`U_{нн}=${variant.U_end}\cdot\dfrac{${t.Unn}}{${t.Uvn}}=${fmt(Unn, 2)}`,
      result: { value: Unn, unit: 'кВ', text: `${fmt(Unn, 2)} кВ (без РПН)` }, why: WHY.U_nn, checks: [{ quantity: 'U_nn' }],
    });
  }
  const r = sol.result;
  add({
    id: 'losses', kind: 'losses', title: 'Суммарные потери активной мощности',
    formula: String.raw`\Delta P_\Sigma=\sum\Delta P_{\text{ветвей}}+\sum\Delta P_x`,
    substitution: String.raw`\Delta P_\Sigma=${fmt(r.loss_branches_P, 2)}+${fmt(r.loss_x_P, 2)}=${fmt(r.loss_total_P, 2)}`,
    result: { value: r.loss_total_P, unit: 'МВт', text: `${fmt(r.loss_total_P, 2)} МВт (${fmt(r.loss_total_pct, 1)} % от P₁)` }, why: WHY.losses,
    checks: [{ quantity: 'loss_total_P' }],
  });

  return { steps, solution: sol, variant };
}

/**
 * Привязать к шагам вопросы банка: вопрос ссылается на вид шага через
 * `related_step`, шаг получает список id.
 * @param {object[]} steps
 * @param {object[]} questions  плоский список вопросов банка
 */
export function attachQuestionIds(steps, questions) {
  for (const s of steps) s.check_question_ids = questions.filter((q) => q.related_step === s.kind).map((q) => q.id);
  return steps;
}
