/**
 * ИСХОДНИК банка тестов «Расчёт режима» (формулы и их детали).
 *
 * Числа НЕ пишутся руками: {{ref:…}}, {{fault:…}}, {{in:…}} подставляет
 * `npm run build:quiz` из движка на эталонном варианте (см. calc/quiz-build.js).
 * Фидбэк неверного варианта по умолчанию берётся из реестра ошибок
 * (calc/misconceptions.js); здесь его переопределяют только там, где вариант
 * нужно объяснить иначе.
 *
 * Формулы — LaTeX в $…$ (рендерит KaTeX). Тексты — String.raw, поэтому
 * обратные слэши пишутся как в LaTeX.
 */

const ok = (text, feedback) => ({ text, correct: true, ...(feedback ? { feedback } : {}) });
const no = (text, misconception, extra = {}) => ({ text, misconception, ...extra });
const R = String.raw;

export const TESTS = [
  { id: 'test1', title: 'Тест 1 · Параметры схемы замещения', description: 'x₀, b₀, R и X линии, B/2, R_T, X_T, потери х.х.; учёт числа цепей и трансформаторов.' },
  { id: 'test2', title: 'Тест 2 · Потери и зарядная мощность', description: 'ΔS, Q_c, направление вычитания/прибавления, потери х.х., что где стоит в схеме.' },
  { id: 'test3', title: 'Тест 3 · Напряжения и итерации', description: 'dU, δU, модуль напряжения, прямой/обратный ход, сходимость, пересчёт на НН.' },
];

const T1 = (id, o) => ({ id: `t1-${id}`, test_id: 'test1', ...o });
const T2 = (id, o) => ({ id: `t2-${id}`, test_id: 'test2', ...o });
const T3 = (id, o) => ({ id: `t3-${id}`, test_id: 'test3', ...o });

export const QUESTIONS = [
  // ═══════════════════════ ТЕСТ 1 · Параметры схемы замещения ═══════════════════════
  T1('q01', {
    type: 'formula_choice', topic: 'x0', difficulty: 1, related_step: 'x0',
    stem: R`Удельное индуктивное сопротивление ВЛ (Ом/км) при среднегеометрическом расстоянии между фазами $D_{ср}$ и радиусе провода $r$:`,
    options: [
      ok(R`$x_0=0.1445\,\lg\dfrac{D_{ср}}{r}+0.0157$`),
      no(R`$x_0=0.1445\,\ln\dfrac{D_{ср}}{r}+0.0157$`, 'log_ln'),
      no(R`$x_0=0.1445\,\lg\dfrac{D_{ср}}{d}+0.0157$, где $d$ — диаметр провода`, 'radius_diameter'),
      no(R`$x_0=0.1445\,\lg\dfrac{8}{12}+0.0157$ при $D_{ср}=8$ м и $r=12$ мм (числа подставлены как есть)`, 'unit_mismatch'),
    ],
    explanation: R`$x_0=0.1445\,\lg\dfrac{D_{ср}}{r}+0.0157$: логарифм ДЕСЯТИЧНЫЙ, в знаменателе РАДИУС, $D_{ср}$ и $r$ — в одних единицах. Для эталона $x_0={{ref:x0|3}}$ Ом/км.`,
  }),
  T1('q02', {
    type: 'formula_choice', topic: 'b0', difficulty: 1, related_step: 'b0',
    stem: R`Удельная ёмкостная проводимость ВЛ (См/км):`,
    options: [
      ok(R`$b_0=\dfrac{7.58\cdot10^{-6}}{\lg(D_{ср}/r)}$`),
      no(R`$b_0=\dfrac{7.58\cdot10^{-6}}{\ln(D_{ср}/r)}$`, 'log_ln', { feedback: R`В формуле $b_0$ — ДЕСЯТИЧНЫЙ логарифм $\lg$. С $\ln$ проводимость $b_0$ получается в {{ratio:log_ln:lg_ratio|2}} раза меньше верной.` }),
      no(R`$b_0=\dfrac{7.58\cdot10^{-6}}{\lg(D_{ср}/d)}$, где $d$ — диаметр`, 'radius_diameter', { feedback: R`В знаменателе логарифма — РАДИУС ($r=d/2$). С диаметром логарифм меньше, а $b_0$ получается завышенным: {{fault:radius_diameter:b0|3}}·10⁻⁶ вместо {{ref:b0|3}}·10⁻⁶ См/км.` }),
      no(R`$b_0=\dfrac{7.58\cdot10^{-6}}{\lg(8/12)}$ при $D_{ср}=8$ м и $r=12$ мм`, 'unit_mismatch', { feedback: R`Единицы разные: $\lg\frac{8}{12}<0$, и проводимость $b_0$ вышла бы ОТРИЦАТЕЛЬНОЙ — физически бессмысленно. Верно: $D_{ср}=8000$ мм при $r=12$ мм.` }),
    ],
    explanation: R`$b_0=\dfrac{7.58\cdot10^{-6}}{\lg(D_{ср}/r)}$. Для эталона $b_0={{ref:b0|3}}\cdot10^{-6}$ См/км.`,
  }),
  T1('q03', {
    type: 'micro_calc', topic: 'lg', difficulty: 1, related_step: 'lg_ratio', quantity: 'lg_ratio', tolerance_pct: 0.5,
    stem: R`Провод {{in:wire.name}}: наружный диаметр $d={{in:wire.d_mm}}$ мм; среднегеометрическое расстояние между фазами $D_{ср}={{in:wire.D_m}}$ м. Найдите $\lg\dfrac{D_{ср}}{r}$ (безразмерная величина, 3 знака).`,
    explanation: R`$r=d/2={{in:wire.d_mm}}/2=12$ мм; $D_{ср}=8000$ мм; $\lg\dfrac{8000}{12}={{ref:lg_ratio|3}}$.`,
  }),
  T1('q04', {
    type: 'micro_calc', topic: 'x0', difficulty: 1, related_step: 'x0', quantity: 'x0', tolerance_pct: 1,
    stem: R`Для тех же данных ($\lg\dfrac{D_{ср}}{r}={{ref:lg_ratio|3}}$) найдите удельное индуктивное сопротивление $x_0$ (Ом/км, 3 знака).`,
    explanation: R`$x_0=0.1445\cdot{{ref:lg_ratio|3}}+0.0157={{ref:x0|3}}$ Ом/км.`,
  }),
  T1('q05', {
    type: 'formula_choice', topic: 'R_line', difficulty: 1, related_step: 'R_line',
    stem: R`Активное сопротивление ДВУХЦЕПНОЙ ВЛ длиной $L$ с удельным сопротивлением одной цепи $R_0$:`,
    options: [
      ok(R`$R_л=\dfrac{R_0\,L}{n}$, при $n=2$ цепях`),
      no(R`$R_л=R_0\,L$ (число цепей не влияет)`, 'no_parallel_div'),
      no(R`$R_л=R_0\,L\,n$`, 'parallel_mult'),
    ],
    explanation: R`Две параллельные цепи — сопротивление уменьшается вдвое: $R_л=\dfrac{R_0L}{n}={{ref:R_line|2}}$ Ом (а не {{fault:no_parallel_div:R_line|2}} Ом для одной цепи).`,
  }),
  T1('q06', {
    type: 'formula_choice', topic: 'B_line', difficulty: 2, related_step: 'B_line',
    stem: R`Ёмкостная проводимость двухцепной ВЛ ($n=2$) и то, что приходится на каждый конец П-образной схемы:`,
    options: [
      ok(R`$B_л=b_0\,L\,n$; в каждый конец — $B_л/2$`),
      no(R`$B_л=b_0\,L/n$; в каждый конец — $B_л/2$`, 'wrong_B_div'),
      no(R`$B_л=b_0\,L$ (число цепей не влияет); в каждый конец — $B_л/2$`, 'no_parallel_div', { feedback: R`Проводимости параллельных цепей СКЛАДЫВАЮТСЯ, число цепей влияет: $B_л=b_0Ln$. Без $n$ $B/2$ = {{fault:no_parallel_div:B_half|0}} мкСм вместо {{ref:B_half|0}} мкСм.` }),
      no(R`$B_л=b_0\,L\,n$; в каждый конец — $B_л$ целиком`, 'Qc_no_half'),
    ],
    explanation: R`$B_л=b_0Ln={{ref:B_line|1}}$ мкСм, в каждый конец П-схемы — половина: $B/2={{ref:B_half|1}}$ мкСм.`,
  }),
  T1('q07', {
    type: 'micro_calc', topic: 'R_line', difficulty: 1, related_step: 'R_line', quantity: 'R_line', tolerance_pct: 1,
    stem: R`Двухцепная ВЛ: $R_0={{in:wire.R0}}$ Ом/км, длина $L={{in:L}}$ км, цепей $n={{in:n_line}}$. Найдите $R_л$ (Ом, 2 знака).`,
    explanation: R`$R_л=\dfrac{{{in:wire.R0}}\cdot{{in:L}}}{{{in:n_line}}}={{ref:R_line|2}}$ Ом.`,
  }),
  T1('q08', {
    type: 'micro_calc', topic: 'B_half', difficulty: 2, related_step: 'B_line', quantity: 'B_half', tolerance_pct: 1,
    stem: R`Для двухцепной ВЛ ($L={{in:L}}$ км, $n={{in:n_line}}$) удельная проводимость $b_0={{ref:b0|3}}\cdot10^{-6}$ См/км. Найдите $B/2$ — проводимость, идущую в каждый конец П-схемы (в мкСм, 1 знак).`,
    explanation: R`$B_л=b_0Ln={{ref:b0|3}}\cdot{{in:L}}\cdot{{in:n_line}}={{ref:B_line|1}}$ мкСм; $B/2={{ref:B_half|1}}$ мкСм.`,
  }),
  T1('q09', {
    type: 'formula_choice', topic: 'R_T', difficulty: 2, related_step: 'R_T',
    stem: R`Активное сопротивление $n$ параллельных трансформаторов, приведённое к стороне ВН ($\Delta P_к$ — в МВт, $U_{вн}$ — в кВ, $S_{ном}$ — в МВА):`,
    options: [
      ok(R`$R_T=\dfrac{\Delta P_к\,U_{вн}^2}{S_{ном}^2\,n}$`),
      no(R`$R_T=\dfrac{\Delta P_к\,U_{вн}}{S_{ном}\,n}$`, 'RT_no_square'),
      no(R`$R_T=\dfrac{\Delta P_к\,U_{вн}^2}{S_{ном}^2}$`, 'no_parallel_div'),
      no(R`$R_T=\dfrac{{{in:transformer.dPk_kW}}\cdot{{in:transformer.Uvn}}^2}{{{in:transformer.Sn}}^2\cdot{{in:transformer.n}}}$ — $\Delta P_к$ взято в кВт`, 'kW_MW'),
    ],
    explanation: R`$R_T=\dfrac{\Delta P_к U_{вн}^2}{S_{ном}^2 n}$ — квадраты у $U_{вн}$ и $S_{ном}$, деление на $n$, $\Delta P_к$ в МВт. Эталон: $R_T={{ref:R_T|2}}$ Ом.`,
  }),
  T1('q10', {
    type: 'formula_choice', topic: 'X_T', difficulty: 2, related_step: 'X_T',
    stem: R`Реактивное сопротивление $n$ параллельных трансформаторов, приведённое к стороне ВН ($u_к$ — в процентах):`,
    options: [
      ok(R`$X_T=\dfrac{u_к\,U_{вн}^2}{100\,S_{ном}\,n}$`),
      no(R`$X_T=\dfrac{u_к\,U_{вн}^2}{S_{ном}\,n}$`, 'XT_no_100'),
      no(R`$X_T=\dfrac{u_к\,U_{сети}^2}{100\,S_{ном}\,n}$, где $U_{сети}=220$ кВ — номинальное напряжение сети`, 'XT_wrong_U'),
      no(R`$X_T=\dfrac{u_к\,U_{вн}^2\,n}{100\,S_{ном}}$`, 'parallel_mult'),
    ],
    explanation: R`$X_T=\dfrac{u_к U_{вн}^2}{100 S_{ном} n}$: проценты → делитель 100, $U_{вн}$ — паспортное напряжение обмотки ВН ({{in:transformer.Uvn}} кВ). Эталон: $X_T={{ref:X_T|2}}$ Ом.`,
  }),
  T1('q11', {
    type: 'micro_calc', topic: 'R_T', difficulty: 2, related_step: 'R_T', quantity: 'R_T', tolerance_pct: 1,
    stem: R`Два трансформатора {{in:transformer.name}}: $\Delta P_к={{in:transformer.dPk_kW}}$ кВт, $U_{вн}={{in:transformer.Uvn}}$ кВ, $S_{ном}={{in:transformer.Sn}}$ МВА. Найдите $R_T$ группы (Ом, 2 знака).`,
    explanation: R`$R_T=\dfrac{0.170\cdot{{in:transformer.Uvn}}^2}{{{in:transformer.Sn}}^2\cdot2}={{ref:R_T|2}}$ Ом ($\Delta P_к$ — в МВт).`,
  }),
  T1('q12', {
    type: 'micro_calc', topic: 'X_T', difficulty: 2, related_step: 'X_T', quantity: 'X_T', tolerance_pct: 1,
    stem: R`Два трансформатора {{in:transformer.name}}: $u_к={{in:transformer.uk_pct}}\,\%$, $U_{вн}={{in:transformer.Uvn}}$ кВ, $S_{ном}={{in:transformer.Sn}}$ МВА. Найдите $X_T$ группы (Ом, 2 знака).`,
    explanation: R`$X_T=\dfrac{{{in:transformer.uk_pct}}\cdot{{in:transformer.Uvn}}^2}{100\cdot{{in:transformer.Sn}}\cdot2}={{ref:X_T|2}}$ Ом.`,
  }),
  T1('q13', {
    type: 'formula_choice', topic: 'dQ_x', difficulty: 2, related_step: 'dQ_x_total',
    stem: R`Потери реактивной мощности холостого хода группы из $n$ трансформаторов:`,
    options: [
      ok(R`$\Delta Q_x=\dfrac{n\,I_x[\%]\,S_{ном}}{100}$`),
      no(R`$\Delta Q_x=\dfrac{n\,I_x[\%]\,P}{100}$, где $P$ — активная мощность, проходящая через трансформатор`, 'Ix_from_P'),
      no(R`$\Delta Q_x=\dfrac{I_x[\%]\,S_{ном}}{100\,n}$`, 'wrong_px_div'),
      no(R`$\Delta Q_x=\dfrac{I_x[\%]\,S_{ном}}{100}$ (для группы — как для одного трансформатора)`, 'no_parallel_div'),
    ],
    explanation: R`$\Delta Q_x=\dfrac{nI_xS_{ном}}{100}$ — от ПОЛНОЙ номинальной мощности и с множителем $n$. Эталон: {{ref:dQ_x_total|2}} Мвар.`,
  }),
  T1('q14', {
    type: 'effect_direction', topic: 'R_line', difficulty: 2, related_step: 'R_line',
    stem: R`При расчёте двухцепной ВЛ ($n=2$) студент забыл разделить $R_л$ на $n$. Потери активной мощности в линии окажутся:`,
    options: [
      ok(R`завышены вдвое (потери пропорциональны $R$)`),
      no(R`занижены вдвое`, 'parallel_mult'),
      no(R`не изменятся: сопротивление на потери не влияет`, 'losses_independent_of_R'),
    ],
    explanation: R`$\Delta P\propto R$. Без деления $R_л$ = {{fault:no_parallel_div:R_line|2}} Ом вместо {{ref:R_line|2}} Ом, то есть вдвое больше — потери завышены вдвое.`,
  }),
  T1('q15', {
    type: 'effect_direction', topic: 'B_line', difficulty: 3, related_step: 'B_line',
    stem: R`Для двухцепной линии $B_л$ разделили на $n$ вместо умножения. Зарядная мощность $Q_c$ при том же $U$ окажется:`,
    options: [
      ok(R`заниженной в 4 раза ($Q_c\propto B$: вместо $b_0Ln$ взято $b_0L/n$, разница — $n^2=4$)`),
      no(R`заниженной в $n=2$ раза`, 'wrong_B_div'),
      no(R`завышенной вдвое`, 'parallel_mult'),
    ],
    explanation: R`Верно $B_л=b_0Ln$, ошибочно $b_0L/n$: отношение $1/n^2$. В эталоне $B/2$ = {{fault:wrong_B_div:B_half|0}} мкСм вместо {{ref:B_half|0}} мкСм — в {{inv:wrong_B_div:B_half|0}} раза меньше.`,
  }),
  T1('q16', {
    type: 'units_check', topic: 'kW_MW', difficulty: 2, related_step: 'R_T',
    stem: R`В формулу $R_T=\dfrac{\Delta P_к U_{вн}^2}{S_{ном}^2 n}$ с $U_{вн}$ в кВ и $S_{ном}$ в МВА подставили $\Delta P_к={{in:transformer.dPk_kW}}$ (кВт) без перевода в МВт. Что получится?`,
    options: [
      ok(R`$R_T$ выйдет в 1000 раз БОЛЬШЕ: {{fault:kW_MW:R_T|0}} Ом вместо {{ref:R_T|2}} Ом`),
      no(R`$R_T$ выйдет в 1000 раз меньше`, 'unit_mismatch', { feedback: R`Направление неверно: кВт больше МВт в 1000 раз, поэтому число {{in:transformer.dPk_kW}} вместо 0.{{in:transformer.dPk_kW}} делает $R_T$ БОЛЬШЕ, а не меньше.` }),
      no(R`Ничего не изменится: единицы сократятся`, 'kW_MW'),
    ],
    explanation: R`Формула даёт Омы только при $\Delta P_к$ в МВт, $U_{вн}$ в кВ, $S_{ном}$ в МВА. В кВт результат в 1000 раз больше.`,
  }),
  T1('q17', {
    type: 'units_check', topic: 'unit_mismatch', difficulty: 2, related_step: 'x0',
    stem: R`Радиус $r=12$ мм, $D_{ср}=8$ м. Студент подставил в $\lg\dfrac{D_{ср}}{r}$ числа 8 и 12 без приведения к одним единицам. Что произойдёт?`,
    options: [
      ok(R`Логарифм станет отрицательным, $x_0$ — нулевым или отрицательным ({{fault:unit_mismatch:x0|3}} Ом/км)`),
      no(R`$x_0$ получится немного другим (около {{ref:x0|2}} Ом/км): единицы сократятся`, 'unit_mismatch'),
      no(R`Ошибки нет — важно только взять радиус, а не диаметр, тогда единицы не имеют значения`, 'radius_diameter'),
    ],
    explanation: R`Отношение $D/r$ безразмерно ТОЛЬКО если обе величины в одних единицах: $\dfrac{8000\text{ мм}}{12\text{ мм}}$, а не $\dfrac{8}{12}$.`,
  }),
  T1('q18', {
    type: 'spot_the_error', topic: 'R_T', difficulty: 2, related_step: 'R_T',
    stem: R`Студент посчитал $R_T=\dfrac{0.170\cdot{{in:transformer.Uvn}}}{{{in:transformer.Sn}}\cdot{{in:transformer.n}}}={{fault:RT_no_square:R_T|2}}$ Ом. Где ошибка?`,
    options: [
      ok(R`Потеряны квадраты: $U_{вн}^2$ в числителе и $S_{ном}^2$ в знаменателе`),
      no(R`$\Delta P_к$ нужно взять в кВт`, 'kW_MW'),
      no(R`Забыто деление на 100`, 'XT_no_100'),
      no(R`Не учтено число трансформаторов`, 'no_parallel_div'),
    ],
    explanation: R`Верно $R_T=\dfrac{\Delta P_кU_{вн}^2}{S_{ном}^2n}={{ref:R_T|2}}$ Ом. Деление на $n$ и перевод в МВт студент сделал верно.`,
  }),
  T1('q19', {
    type: 'spot_the_error', topic: 'X_T', difficulty: 3, related_step: 'X_T',
    stem: R`Студент посчитал $X_T=\dfrac{{{in:transformer.uk_pct}}\cdot{{in:U_nom}}^2}{100\cdot{{in:transformer.Sn}}\cdot{{in:transformer.n}}}={{fault:XT_wrong_U:X_T|1}}$ Ом. Где ошибка?`,
    options: [
      ok(R`Взято 220 кВ (напряжение сети) вместо паспортного $U_{вн}={{in:transformer.Uvn}}$ кВ обмотки ВН`),
      no(R`Забыт делитель 100`, 'XT_no_100'),
      no(R`Потеряны квадраты у $U$ и $S$`, 'RT_no_square'),
      no(R`Число трансформаторов учтено неверно`, 'no_parallel_div'),
    ],
    explanation: R`$X_T$ приводится к стороне ВН именно через $U_{вн}$ трансформатора: {{in:transformer.Uvn}} кВ, а не 220 кВ. Верно: {{ref:X_T|2}} Ом.`,
  }),
  T1('q20', {
    type: 'concept', topic: 'which_U_in_transformer', difficulty: 2, related_step: 'X_T',
    stem: R`Какое напряжение подставляют в $R_T$ и $X_T$ трансформаторов, если схема замещения приведена к стороне ВН?`,
    options: [
      ok(R`Паспортное $U_{вн}$ обмотки ВН ({{in:transformer.Uvn}} кВ)`),
      no(R`Номинальное напряжение сети ({{in:U_nom}} кВ)`, 'XT_wrong_U'),
      no(R`Напряжение обмотки НН ({{in:transformer.Unn}} кВ): трансформатор приводят к стороне НН`, 'nn_no_ratio', { feedback: R`Схема замещения приведена к стороне ВН, поэтому и сопротивления считаются при $U_{вн}={{in:transformer.Uvn}}$ кВ. Пересчёт на НН — отдельный последний шаг: $U_{нн}=U\cdot U_{нн.ном}/U_{вн.ном}$.` }),
    ],
    explanation: R`Сопротивления приводятся к стороне, на которой ведётся расчёт сети (ВН), и берутся при паспортном напряжении обмотки ВН: {{in:transformer.Uvn}} кВ. Отличие от {{in:U_nom}} кВ даёт разницу в $X_T$ на {{pct:XT_wrong_U:X_T|1}} %.`,
  }),

  // ═══════════════════════ ТЕСТ 2 · Потери и зарядная мощность ═══════════════════════
  T2('q01', {
    type: 'formula_choice', topic: 'dS', difficulty: 1, related_step: 'dS_line',
    stem: R`Потери мощности в продольной ветви с сопротивлением $R+jX$ при передаче $P+jQ$ и напряжении $U$:`,
    options: [
      ok(R`$\Delta S=\dfrac{P^2+Q^2}{U^2}\,(R+jX)$`),
      no(R`$\Delta S=\dfrac{P^2+Q^2}{U}\,(R+jX)$`, 'missing_U_square'),
      no(R`$\Delta S=\dfrac{P+Q}{U^2}\,(R+jX)$`, 'missing_PQ_square'),
      no(R`$\Delta S=\dfrac{(P+jQ)^2}{U^2}\,(R+jX)$`, 's_instead_of_pq'),
    ],
    explanation: R`Квадраты — и в числителе ($P^2+Q^2=|S|^2$), и в знаменателе ($U^2$). Эталон, итерация 1: $\Delta P={{ref:dS_line_P@1|2}}$ МВт.`,
  }),
  T2('q02', {
    type: 'concept', topic: 'S_squared', difficulty: 2, related_step: 'dS_line',
    stem: R`Почему потери можно записать как $\Delta S=\dfrac{S^2}{U^2}Z$, если под $S^2$ понимать квадрат МОДУЛЯ мощности?`,
    options: [
      ok(R`Потому что $|S|^2=P^2+Q^2$: в числителе стоит сумма квадратов активной и реактивной мощности`),
      no(R`Потому что $S=P+Q$, значит $S^2=(P+Q)^2$`, 'missing_PQ_square'),
      no(R`Потому что $(P+jQ)^2=P^2+Q^2$`, 's_instead_of_pq'),
      no(R`Потому что напряжение $U$ в знаменателе сокращается`, 'missing_U_square'),
    ],
    explanation: R`$S^2$ здесь — это $|S|^2=P^2+Q^2$ (модуль в квадрате). Квадрат КОМПЛЕКСНОГО числа $(P+jQ)^2=P^2-Q^2+2jPQ$ — другая величина.`,
  }),
  T2('q03', {
    type: 'micro_calc', topic: 'dP_line', difficulty: 2, related_step: 'dS_line', quantity: 'dS_line_P', iteration: 1, tolerance_pct: 3,
    stem: R`Итерация 1 (все напряжения равны {{in:U_nom}} кВ). В линию поступает $S={{ref:S_line_in_P@1|2}}+j{{ref:S_line_in_Q@1|2}}$ МВА; $R_л={{ref:R_line|2}}$ Ом. Найдите потери активной мощности $\Delta P_л$ (МВт, 2 знака).`,
    explanation: R`$\Delta P_л=\dfrac{{{ref:S_line_in_P@1|2}}^2+{{ref:S_line_in_Q@1|2}}^2}{{{in:U_nom}}^2}\cdot{{ref:R_line|2}}={{ref:dS_line_P@1|2}}$ МВт.`,
  }),
  T2('q04', {
    type: 'micro_calc', topic: 'dQ_line', difficulty: 2, related_step: 'dS_line', quantity: 'dS_line_Q', iteration: 1, tolerance_pct: 3,
    stem: R`Те же условия (итерация 1, $S={{ref:S_line_in_P@1|2}}+j{{ref:S_line_in_Q@1|2}}$ МВА, $U={{in:U_nom}}$ кВ), $X_л={{ref:X_line|2}}$ Ом. Найдите потери реактивной мощности $\Delta Q_л$ (Мвар, 2 знака).`,
    explanation: R`$\Delta Q_л=\dfrac{P^2+Q^2}{U^2}X_л={{ref:dS_line_Q@1|2}}$ Мвар.`,
  }),
  T2('q05', {
    type: 'micro_calc', topic: 'Qc', difficulty: 1, related_step: 'Qc', quantity: 'Qc1', iteration: 1, tolerance_pct: 1,
    stem: R`Итерация 1: $U={{in:U_nom}}$ кВ, $B/2={{ref:B_half|0}}$ мкСм. Найдите зарядную мощность узла 1 $Q_{c1}$ (Мвар, 2 знака).`,
    explanation: R`$Q_{c1}=U^2\cdot\dfrac{B}{2}={{in:U_nom}}^2\cdot{{ref:B_half|0}}\cdot10^{-6}={{ref:Qc1@1|2}}$ Мвар.`,
  }),
  T2('q06', {
    type: 'formula_choice', topic: 'Qc', difficulty: 1, related_step: 'Qc',
    stem: R`Зарядная мощность, генерируемая ёмкостью и приходящаяся на ОДИН узел П-образной схемы линии:`,
    options: [
      ok(R`$Q_c=U^2\cdot\dfrac{B}{2}$`),
      no(R`$Q_c=U^2\cdot B$`, 'Qc_no_half'),
      no(R`$Q_c=-U^2\cdot\dfrac{B}{2}$ (ёмкость потребляет реактивную мощность)`, 'Qc_sign'),
      no(R`$Q_c=U\cdot\dfrac{B}{2}$`, 'missing_U_square', { feedback: R`Зарядная мощность пропорциональна КВАДРАТУ напряжения: $Q_c=U^2B/2$. Без квадрата получается {{fault:missing_U_square:Qc1|2}} вместо {{ref:Qc1|2}} — при $U=220$ кВ это в {{inv:missing_U_square:Qc1|0}} раз меньше.` }),
    ],
    explanation: R`$Q_c=U^2\dfrac{B}{2}$ (кВ² · См = Мвар). В каждый конец идёт половина $B$, знак «+» — ёмкость ГЕНЕРИРУЕТ.`,
  }),
  T2('q07', {
    type: 'concept', topic: 'Qc_sign', difficulty: 2, related_step: 'Qc',
    stem: R`Линия 220 кВ длиной около 80 км: она генерирует или потребляет реактивную мощность в своих ёмкостях, и как это входит в баланс в узле?`,
    options: [
      ok(R`Генерирует: $Q_c$ входит в баланс со знаком «+» и уменьшает реактивную мощность, которую нужно получить от источника`),
      no(R`Потребляет: $Q_c$ вычитается из $Q$`, 'Qc_sign'),
      no(R`Генерирует, поэтому вычитается из потока: она «уходит» на землю`, 'Qc_sign', { feedback: R`Генерация — это добавление в баланс, а не уход. Ток заряда «уходит на землю» физически, но реактивная мощность ёмкости при этом ПОСТАВЛЯЕТСЯ в сеть: $Q_c$ входит со знаком «+». Иначе $Q_2$ получится {{fault:Qc_sign:S2_Q|1}} вместо {{ref:S2_Q|1}} Мвар.` }),
      no(R`Генерирует, но учитывается в продольной ветви вместе с $R+jX$`, 'shunt_in_branch'),
    ],
    explanation: R`Ёмкость — источник реактивной мощности: $Q_c=U^2B/2>0$ прибавляется к $Q$ в узле. Поэтому длинные линии «разгружают» источник по реактивной мощности.`,
  }),
  T2('q08', {
    type: 'concept', topic: 'Q2_gt_Q1', difficulty: 3, related_step: 'S_end',
    stem: R`В эталонной задаче реактивная мощность на нагрузке $Q_2={{ref:S2_Q@3|1}}$ Мвар БОЛЬШЕ, чем подал источник ($Q_1={{ref:Q1|1}}$ Мвар). Почему?`,
    options: [
      ok(R`Ёмкости линии генерируют $Q_{c1}+Q_{c2}\approx{{ref:Qc1@3|0}}+{{ref:Qc2@3|0}}$ Мвар, а на индуктивностях линии и трансформаторов теряется лишь около {{ref:dS_line_Q@3|0}}+{{ref:dS_T_Q@3|0}} Мвар`),
      no(R`Потери $\Delta Q$ прибавляются к мощности при движении к нагрузке`, 'direction_sign'),
      no(R`Это ошибка расчёта: на конце всегда меньше, чем в начале`, 'Qc_sign'),
    ],
    explanation: R`Баланс реактивной мощности: $Q_2=Q_1+Q_{c1}+Q_{c2}-\Delta Q_л-\Delta Q_x-\Delta Q_T$. Генерация ёмкостей ($\approx{{ref:Qc1@3|0}}+{{ref:Qc2@3|0}}$ Мвар) перекрывает потери, поэтому $Q_2>Q_1$.`,
  }),
  T2('q09', {
    type: 'concept', topic: 'shunts', difficulty: 2, related_step: 'scheme',
    stem: R`Почему $B/2$ линии и потери х.х. трансформаторов стоят на схеме замещения в УЗЛАХ, а не в продольной ветви?`,
    options: [
      ok(R`Это поперечные (шунтирующие) элементы: ток заряда и ток х.х. текут на землю, а не вдоль ветви`),
      no(R`Просто так удобнее считать — на результат это не влияет`, 'shunt_in_branch'),
      no(R`Потому что они зависят от тока нагрузки`, 'Ix_from_P'),
      no(R`Потому что их нельзя делить на число цепей`, 'no_parallel_div'),
    ],
    explanation: R`Потери х.х. и ёмкость зависят от напряжения узла, а не от тока нагрузки, и текут поперёк ветви. В ветви $R+jX$ остаётся то, что зависит от тока нагрузки.`,
  }),
  T2('q10', {
    type: 'concept', topic: 'parallel', difficulty: 3, related_step: 'scheme',
    stem: R`Для двух цепей и двух трансформаторов: почему $R$ и $X$ ДЕЛЯТСЯ на $n$, а $B$ и $\Delta P_x$ УМНОЖАЮТСЯ?`,
    options: [
      ok(R`Продольные сопротивления параллельных ветвей соединены параллельно ($R_\parallel=R/n$), а поперечные проводимости и потери х.х. независимых элементов складываются`),
      no(R`Это условность: любую величину можно делить или умножать на $n$`, 'no_parallel_div'),
      no(R`Потому что $B$ и $\Delta P_x$ тоже делятся на $n$, а $R$ и $X$ умножаются`, 'parallel_mult'),
      no(R`Потому что ёмкости цепей соединены последовательно, значит $B$ делится на $n$`, 'wrong_B_div'),
    ],
    explanation: R`Два одинаковых элемента параллельно: общее сопротивление вдвое меньше, а общая проводимость вдвое больше. Потери х.х. каждого трансформатора протекают независимо и суммируются.`,
  }),
  T2('q11', {
    type: 'spot_the_error', topic: 'dS', difficulty: 2, related_step: 'dS_line',
    stem: R`Студент посчитал потери в линии: $\Delta P=\dfrac{{{ref:S_line_in_P@1|2}}^2+{{ref:S_line_in_Q@1|2}}^2}{220}\cdot{{ref:R_line|2}}={{fault:missing_U_square:dS_line_P@1|1}}$ МВт. Где ошибка?`,
    options: [
      ok(R`В знаменателе должно быть $U^2$, а не $U$ (иначе потери больше передаваемой мощности)`),
      no(R`В числителе нужна сумма $P+Q$`, 'missing_PQ_square'),
      no(R`Сопротивление $R_л$ нужно перевести в кОм`, 'unit_mismatch'),
      no(R`Потери надо прибавлять к мощности, а не вычитать`, 'direction_sign'),
    ],
    explanation: R`Верно: $\Delta P=\dfrac{P^2+Q^2}{U^2}R={{ref:dS_line_P@1|2}}$ МВт. Результат «{{fault:missing_U_square:dS_line_P@1|0}} МВт» больше самой передаваемой мощности — это сигнал ошибки.`,
  }),
  T2('q12', {
    type: 'spot_the_error', topic: 'Qc', difficulty: 2, related_step: 'Qc',
    stem: R`Студент нашёл зарядную мощность узла 1: $Q_{c1}={{in:U_nom}}^2\cdot{{ref:B_line|0}}\cdot10^{-6}={{fault:Qc_no_half:Qc1|2}}$ Мвар. Где ошибка?`,
    options: [
      ok(R`Взято полное $B_л$; в каждый узел П-схемы идёт $B/2$`),
      no(R`Не учтено число цепей: $B_л$ надо умножить на $n$`, 'no_parallel_div'),
      no(R`Проводимость надо разделить на $n$`, 'wrong_B_div'),
      no(R`Зарядная мощность вычитается, значит ответ должен быть отрицательным`, 'Qc_sign'),
    ],
    explanation: R`$B_л={{ref:B_line|0}}$ мкСм уже учитывает $n$; на один узел приходится $B/2$: $Q_{c1}={{ref:Qc1@1|2}}$ Мвар.`,
  }),
  T2('q13', {
    type: 'spot_the_error', topic: 'dQ_x', difficulty: 3, related_step: 'dQ_x_total',
    stem: R`Студент нашёл $\Delta Q_x=\dfrac{2\cdot{{in:transformer.Ix_pct}}\cdot{{ref:S_T_in_P@3|1}}}{100}={{fault:Ix_from_P:dQ_x_total|2}}$ Мвар (здесь {{ref:S_T_in_P@3|1}} МВт — активная мощность, проходящая через трансформаторы). Где ошибка?`,
    options: [
      ok(R`Потери реактивной мощности х.х. считаются от $S_{ном}$, а не от активной мощности нагрузки`),
      no(R`Надо разделить на $n$`, 'wrong_px_div'),
      no(R`$I_x$ нужно брать в долях, а не в процентах`, 'XT_no_100'),
      no(R`Не учтено число трансформаторов`, 'no_parallel_div'),
    ],
    explanation: R`$\Delta Q_x=\dfrac{nI_xS_{ном}}{100}={{ref:dQ_x_total|2}}$ Мвар — паспортная величина, не зависящая от нагрузки.`,
  }),
  T2('q14', {
    type: 'spot_the_error', topic: 'dP_x', difficulty: 2, related_step: 'dP_x_total',
    stem: R`Студент нашёл потери х.х. двух трансформаторов: $\Delta P_x=\dfrac{{{in:transformer.dPx_kW}}}{2}$ кВт $={{fault:wrong_px_div:dP_x_total|3}}$ МВт. Где ошибка?`,
    options: [
      ok(R`Потери х.х. складываются: $\Delta P_x=n\,\Delta P_{x1}$ — надо умножать на 2, а не делить`),
      no(R`Потери х.х. зависят от нагрузки и должны считаться итерационно`, 'Ix_from_P'),
      no(R`Ошибки нет: параллельные элементы делят потери поровну`, 'no_parallel_div'),
      no(R`Не переведены кВт в МВт`, 'kW_MW'),
    ],
    explanation: R`Верно: $\Delta P_x=2\cdot{{in:transformer.dPx_kW}}$ кВт $={{ref:dP_x_total|3}}$ МВт. Каждый сердечник намагничивается независимо.`,
  }),
  T2('q15', {
    type: 'units_check', topic: 'dimension', difficulty: 2, related_step: 'dS_line',
    stem: R`Все величины в формуле потерь заданы в МВт, Мвар, кВ, Ом. В каких единицах получится $\Delta S$ и нужны ли переводные коэффициенты?`,
    options: [
      ok(R`В МВ·А (МВт и Мвар): переводные коэффициенты не нужны — единицы согласованы`),
      no(R`В кВ·А: результат надо умножить на 1000`, 'kW_MW'),
      no(R`В В·А: сначала надо перевести кВ в В`, 'unit_mismatch'),
      no(R`В МВ·А, но нужен множитель $\sqrt3$ (мощность трёхфазная)`, 'sqrt3_factor'),
    ],
    explanation: R`$\dfrac{\text{МВт}^2}{\text{кВ}^2}\cdot\text{Ом}=\text{МВт}$ — множитель $10^6/10^6$ сокращается. Формулы уже записаны для трёхфазной мощности и линейного напряжения.`,
  }),
  T2('q16', {
    type: 'step_order', topic: 'forward_pass', difficulty: 2, related_step: 'S_end',
    stem: R`Расставьте шаги ПРЯМОГО хода одной итерации в правильном порядке (от источника к нагрузке).`,
    items: [
      R`Прибавить $Q_{c1}$ к $Q_1$ в узле 1`,
      R`Вычесть потери $\Delta S_л$ в линии`,
      R`В узле 2: прибавить $Q_{c2}$, вычесть $\Delta P_x+j\Delta Q_x$`,
      R`Вычесть потери $\Delta S_T$ в трансформаторах`,
      R`Получить $S_2$ — мощность нагрузки`,
    ],
    explanation: R`Прямой ход идёт по цепочке от источника: узел 1 → линия → узел 2 → трансформаторы → нагрузка. В узлах учитываются шунты ($Q_c$, потери х.х.), в ветвях — потери $\Delta S$.`,
  }),
  T2('q17', {
    type: 'concept', topic: 'direction', difficulty: 2, related_step: 'S_end',
    stem: R`На прямом ходе (от источника к нагрузке) потери в ветви:`,
    options: [
      ok(R`вычитаются: мощность на конце ветви меньше, чем на начале`),
      no(R`прибавляются: к нагрузке надо доставить ещё и потери`, 'direction_sign'),
      no(R`на прямом ходе не учитываются, только на обратном`, 'losses_independent_of_R'),
    ],
    explanation: R`Источник выдаёт мощность, часть теряется в ветви, до нагрузки доходит остаток: $S_{кон}=S_{нач}-\Delta S$.`,
  }),
  T2('q18', {
    type: 'concept', topic: 'which_U', difficulty: 3, related_step: 'dS_line',
    stem: R`Итерация 2. При каком напряжении считать потери в линии 1–2?`,
    options: [
      ok(R`При $U_1$ — напряжении начала ветви, где известен поток мощности, значение с итерации 1`),
      no(R`При $U_2$ — напряжении конца ветви: оно точнее`, 'wrong_U_node'),
      no(R`При $U_{ном}=220$ кВ — оно не меняется`, 'nominal_only'),
    ],
    explanation: R`Мощность $S$ известна в начале ветви, поэтому и потери считаются при напряжении ЭТОГО узла, найденном на предыдущей итерации ($U_1={{ref:U1@1|1}}$ кВ).`,
  }),
  T2('q19', {
    type: 'micro_calc', topic: 'dQ_T', difficulty: 3, related_step: 'dS_T', quantity: 'dS_T_Q', iteration: 1, tolerance_pct: 3,
    stem: R`Итерация 1 ($U={{in:U_nom}}$ кВ): в трансформаторы входит $S={{ref:S_T_in_P@1|2}}+j{{ref:S_T_in_Q@1|2}}$ МВА, $X_T={{ref:X_T|2}}$ Ом. Найдите $\Delta Q_T$ (Мвар, 2 знака).`,
    explanation: R`$\Delta Q_T=\dfrac{{{ref:S_T_in_P@1|2}}^2+{{ref:S_T_in_Q@1|2}}^2}{{{in:U_nom}}^2}\cdot{{ref:X_T|2}}={{ref:dS_T_Q@1|2}}$ Мвар.`,
  }),

  // ═══════════════════════ ТЕСТ 3 · Напряжения и итерации ═══════════════════════
  T3('q01', {
    type: 'formula_choice', topic: 'dU', difficulty: 1, related_step: 'dU',
    stem: R`Продольная составляющая падения напряжения в ветви с сопротивлением $R+jX$ при потоке $P+jQ$ в конце ветви:`,
    options: [
      ok(R`$dU=\dfrac{P\,R+Q\,X}{U}$`),
      no(R`$dU=\dfrac{P\,X-Q\,R}{U}$`, 'dU_deltaU_swap'),
      no(R`$dU=\dfrac{\sqrt3\,(P\,R+Q\,X)}{U}$`, 'sqrt3_factor'),
    ],
    explanation: R`Продольная (по направлению напряжения): $dU=\dfrac{PR+QX}{U}$; поперечная: $\delta U=\dfrac{PX-QR}{U}$. Формулы уже для линейного напряжения и трёхфазной мощности.`,
  }),
  T3('q02', {
    type: 'formula_choice', topic: 'U_modulus', difficulty: 2, related_step: 'U_modulus',
    stem: R`Модуль напряжения в начале ветви по напряжению в конце $U_{кон}$ и составляющим падения:`,
    options: [
      ok(R`$U=\sqrt{(U_{кон}+dU)^2+\delta U^2}$`),
      no(R`$U=U_{кон}+dU$`, 'no_transverse'),
      no(R`$U=\sqrt{(U_{кон}-dU)^2+\delta U^2}$`, 'direction_sign'),
      no(R`$U=\sqrt{(U_{кон}+\delta U)^2+dU^2}$`, 'dU_deltaU_swap'),
    ],
    explanation: R`Треугольник напряжений: продольная составляющая складывается с $U_{кон}$ по направлению, поперечная — перпендикулярно; модуль — гипотенуза.`,
  }),
  T3('q03', {
    type: 'micro_calc', topic: 'dU_T', difficulty: 2, related_step: 'dU', quantity: 'dU_T', iteration: 1, tolerance_pct: 1,
    stem: R`Итерация 1. Мощность в конце трансформаторов $S={{ref:S2_P@1|2}}+j{{ref:S2_Q@1|2}}$ МВА, $R_T={{ref:R_T|2}}$ Ом, $X_T={{ref:X_T|2}}$ Ом, напряжение $U={{in:U_end}}$ кВ. Найдите $dU_T$ (кВ, 2 знака).`,
    explanation: R`$dU_T=\dfrac{{{ref:S2_P@1|2}}\cdot{{ref:R_T|2}}+{{ref:S2_Q@1|2}}\cdot{{ref:X_T|2}}}{{{in:U_end}}}={{ref:dU_T@1|2}}$ кВ.`,
  }),
  T3('q04', {
    type: 'micro_calc', topic: 'deltaU_T', difficulty: 2, related_step: 'dU', quantity: 'deltaU_T', iteration: 1, tolerance_pct: 1,
    stem: R`Для тех же данных найдите поперечную составляющую $\delta U_T$ (кВ, 2 знака).`,
    explanation: R`$\delta U_T=\dfrac{{{ref:S2_P@1|2}}\cdot{{ref:X_T|2}}-{{ref:S2_Q@1|2}}\cdot{{ref:R_T|2}}}{{{in:U_end}}}={{ref:deltaU_T@1|2}}$ кВ.`,
  }),
  T3('q05', {
    type: 'micro_calc', topic: 'U2', difficulty: 2, related_step: 'U_modulus', quantity: 'U2', iteration: 1, tolerance_pct: 0.1,
    stem: R`Итерация 1. $U_{кон}={{in:U_end}}$ кВ, $dU_T={{ref:dU_T@1|2}}$ кВ, $\delta U_T={{ref:deltaU_T@1|2}}$ кВ. Найдите $U_2$ — напряжение на входе трансформаторов (кВ, 1 знак).`,
    explanation: R`$U_2=\sqrt{({{in:U_end}}+{{ref:dU_T@1|2}})^2+{{ref:deltaU_T@1|2}}^2}={{ref:U2@1|1}}$ кВ.`,
  }),
  T3('q06', {
    type: 'micro_calc', topic: 'U1', difficulty: 3, related_step: 'U_modulus', quantity: 'U1', iteration: 1, tolerance_pct: 0.1,
    stem: R`Итерация 1. Для линии: $dU_л={{ref:dU_line@1|2}}$ кВ, $\delta U_л={{ref:deltaU_line@1|2}}$ кВ; напряжение в конце линии $U_2={{ref:U2@1|1}}$ кВ. Найдите $U_1$ (кВ, 1 знак).`,
    explanation: R`$U_1=\sqrt{({{ref:U2@1|1}}+{{ref:dU_line@1|2}})^2+{{ref:deltaU_line@1|2}}^2}={{ref:U1@1|1}}$ кВ.`,
  }),
  T3('q07', {
    type: 'micro_calc', topic: 'U_nn', difficulty: 1, related_step: 'U_nn', quantity: 'U_nn', tolerance_pct: 1,
    stem: R`Напряжение за сопротивлением обмоток (сторона ВН) равно {{in:U_end}} кВ. Найдите напряжение на стороне НН без РПН (кВ, 2 знака): $U_{вн.ном}={{in:transformer.Uvn}}$ кВ, $U_{нн.ном}={{in:transformer.Unn}}$ кВ.`,
    explanation: R`$U_{нн}={{in:U_end}}\cdot\dfrac{{{in:transformer.Unn}}}{{{in:transformer.Uvn}}}={{ref:U_nn|2}}$ кВ.`,
  }),
  T3('q08', {
    type: 'spot_the_error', topic: 'no_transverse', difficulty: 2, related_step: 'U_modulus',
    stem: R`Студент нашёл $U_2={{in:U_end}}+{{ref:dU_T@1|2}}={{fault:no_transverse:U2@1|1}}$ кВ. Что он упустил?`,
    options: [
      ok(R`Поперечную составляющую $\delta U$: точный модуль $\sqrt{(U+dU)^2+\delta U^2}$; приближение занижает результат на {{diff:no_transverse:U2@1|2}} кВ`),
      no(R`Перепутал продольную и поперечную составляющие`, 'dU_deltaU_swap'),
      no(R`Не учёл коэффициент трансформации`, 'nn_no_ratio'),
      no(R`Потери мощности надо было вычесть`, 'direction_sign'),
    ],
    explanation: R`Точно: $U_2={{ref:U2@1|1}}$ кВ. Отбрасывание $\delta U$ даёт {{fault:no_transverse:U2@1|1}} кВ: занижение $\approx\delta U^2/(2U)$ — доли кВ.`,
  }),
  T3('q09', {
    type: 'spot_the_error', topic: 'dU_swap', difficulty: 2, related_step: 'dU',
    stem: R`Студент нашёл продольную составляющую $dU=\dfrac{P\,X-Q\,R}{U}={{fault:dU_deltaU_swap:dU_T@1|2}}$ кВ. Где ошибка?`,
    options: [
      ok(R`Это формула ПОПЕРЕЧНОЙ составляющей $\delta U$; для $dU$ нужна $\dfrac{PR+QX}{U}$ (верно: {{ref:dU_T@1|2}} кВ)`),
      no(R`Нужно домножить на $\sqrt3$`, 'sqrt3_factor'),
      no(R`Надо поставить знак «минус»: потери вычитаются`, 'direction_sign'),
    ],
    explanation: R`$dU=\dfrac{PR+QX}{U}$ — «R при P, X при Q»; $\delta U=\dfrac{PX-QR}{U}$ — наоборот, со знаком «минус».`,
  }),
  T3('q10', {
    type: 'concept', topic: 'transverse_size', difficulty: 3, related_step: 'U_modulus',
    stem: R`Насколько отбрасывание поперечной составляющей $\delta U$ занижает $U_2$ в эталонной задаче (сеть 220 кВ)?`,
    options: [
      ok(R`Всего на доли кВ ({{diff:no_transverse:U2@1|2}} кВ): $\delta U\ll U$, добавка $\approx\delta U^2/(2U)$. Для оценки допустимо, для точного расчёта — нет`),
      no(R`Примерно на {{ref:deltaU_T@1|0}} кВ — на величину $\delta U$: поперечная составляющая добавляется арифметически`, 'dU_deltaU_swap'),
      no(R`Не занижает совсем: она перпендикулярна и вклада не даёт`, 'no_transverse'),
    ],
    explanation: R`Модуль — гипотенуза: $\sqrt{a^2+b^2}-a\approx\dfrac{b^2}{2a}$. При $\delta U={{ref:deltaU_T@1|1}}$ кВ и $U\approx{{ref:U2@1|0}}$ кВ это доли кВ, но не нуль.`,
  }),
  T3('q11', {
    type: 'concept', topic: 'why_iterate', difficulty: 1, related_step: 'convergence',
    stem: R`Зачем нужны итерации при расчёте режима?`,
    options: [
      ok(R`Потери и $Q_c$ зависят от напряжений, а напряжения — от потерь: сначала берут $U_{ном}$, затем уточняют по найденным значениям`),
      no(R`Чтобы повысить точность округления чисел`, 'no_iteration'),
      no(R`Итерации не нужны: достаточно одного прохода при номинальных напряжениях`, 'no_iteration'),
    ],
    explanation: R`Замкнутая зависимость $U\leftrightarrow\Delta S,Q_c$ решается последовательными приближениями. В эталоне $Q_{c1}$ меняется с {{ref:Qc1@1|2}} до {{ref:Qc1@3|2}} Мвар за три итерации.`,
  }),
  T3('q12', {
    type: 'concept', topic: 'convergence', difficulty: 2, related_step: 'convergence',
    stem: R`Критерий окончания итераций:`,
    options: [
      ok(R`Максимальное изменение напряжений узлов между соседними итерациями меньше заданной точности: $\max|U_k-U_k'|<\varepsilon$ (например, 0.01 кВ)`),
      no(R`Всегда ровно три итерации`, 'no_iteration'),
      no(R`Когда напряжение стало равно номинальному`, 'nominal_only'),
    ],
    explanation: R`Останавливаются, когда напряжения перестали заметно меняться. Обычно хватает 3–5 итераций; за первые три $U_1$ в эталоне уточняется с {{ref:U1@1|1}} до {{ref:U1@3|1}} кВ.`,
  }),
  T3('q13', {
    type: 'concept', topic: 'initial_U', difficulty: 2, related_step: 'Qc',
    stem: R`Какое напряжение брать в потерях и $Q_c$ на ПЕРВОЙ итерации?`,
    options: [
      ok(R`Номинальное ($U_{ном}={{in:U_nom}}$ кВ) во всех узлах — других значений ещё нет`),
      no(R`Заданное напряжение в конце цепочки ({{in:U_end}} кВ)`, 'wrong_U_node'),
      no(R`Нулевое: сначала считаем без напряжений`, 'no_iteration'),
    ],
    explanation: R`Инициализация — $U_{ном}$ во всех узлах; заданное напряжение относится только к конечной точке и используется на обратном ходе.`,
  }),
  T3('q14', {
    type: 'step_order', topic: 'backward_pass', difficulty: 2, related_step: 'dU',
    stem: R`Расставьте шаги ОБРАТНОГО хода (напряжения) в правильном порядке.`,
    items: [
      R`Взять заданное напряжение в конце ({{in:U_end}} кВ) и поток $S$ в конце трансформаторов`,
      R`Найти $dU_T$ и $\delta U_T$`,
      R`Найти $U_2=\sqrt{({{in:U_end}}+dU_T)^2+\delta U_T^2}$`,
      R`Взять поток в конце линии и напряжение $U_2$`,
      R`Найти $dU_л$, $\delta U_л$ и $U_1$`,
    ],
    explanation: R`Обратный ход идёт от известного напряжения к источнику: сначала трансформаторы (получаем $U_2$), затем линия (получаем $U_1$).`,
  }),
  T3('q15', {
    type: 'step_order', topic: 'solution_order', difficulty: 2, related_step: 'convergence',
    stem: R`Расставьте этапы всего расчёта режима в правильном порядке.`,
    items: [
      R`Параметры схемы замещения: $x_0,\ b_0,\ R_л,\ X_л,\ B/2,\ R_T,\ X_T,\ \Delta P_x,\ \Delta Q_x$`,
      R`Принять все напряжения равными $U_{ном}$`,
      R`Прямой ход: мощности с учётом $Q_c$ и потерь`,
      R`Обратный ход: напряжения от заданного в конце`,
      R`Сравнить напряжения с предыдущей итерацией; повторить, если разница больше $\varepsilon$`,
      R`Пересчитать $U$ на сторону НН и найти суммарные потери`,
    ],
    explanation: R`Сначала схема замещения, затем итерации «мощности вперёд — напряжения назад» до сходимости, затем итоговые величины.`,
  }),
  T3('q16', {
    type: 'effect_direction', topic: 'sign_backward', difficulty: 3, related_step: 'U_modulus',
    stem: R`На обратном ходе (от нагрузки к источнику) $dU$ ВЫЧЛИ из $U_{кон}$ вместо прибавления. Напряжение в начале ветви получится:`,
    options: [
      ok(R`ниже, чем в конце ветви — это противоречит физике: при передаче мощности к нагрузке напряжение в начале выше`),
      no(R`выше на $2\,dU$`, 'direction_sign'),
      no(R`таким же: знак $dU$ на результат не влияет`, 'no_transverse'),
    ],
    explanation: R`Нагрузка «просаживает» напряжение, поэтому в начале ветви (ближе к источнику) оно выше: $U_{нач}\approx U_{кон}+dU$. Результат «ниже» — признак ошибки в знаке.`,
  }),
  T3('q17', {
    type: 'concept', topic: 'U_above_nominal', difficulty: 3, related_step: 'dU',
    stem: R`Почему в эталонной задаче $U_2\approx{{ref:U2@3|0}}$ кВ выше номинала 220 кВ?`,
    options: [
      ok(R`Напряжение растёт в сторону источника: заданные {{in:U_end}} кВ за сопротивлением обмоток плюс падение напряжения $dU_T$ на трансформаторах`),
      no(R`Из-за зарядной мощности линии напряжение всегда падает`, 'Qc_sign'),
      no(R`Это ошибка: в узле напряжение не может превышать номинальное`, 'nominal_only'),
      no(R`Потому что поперечная составляющая всегда положительна и складывается с $U$ арифметически`, 'dU_deltaU_swap'),
    ],
    explanation: R`Напряжение {{in:U_end}} кВ задано ПОСЛЕ сопротивления обмоток, поэтому на входе трансформаторов оно выше на $dU_T$: {{in:U_end}}$+{{ref:dU_T@3|1}}\approx{{ref:U2@3|0}}$ кВ.`,
  }),
  T3('q18', {
    type: 'units_check', topic: 'U_nn', difficulty: 2, related_step: 'U_nn',
    stem: R`Как пересчитать напряжение со стороны ВН на сторону НН трансформатора без РПН?`,
    options: [
      ok(R`Умножить на $U_{нн.ном}/U_{вн.ном}$ ({{in:transformer.Unn}}/{{in:transformer.Uvn}}): {{ref:U_nn|2}} кВ вместо {{in:U_end}} кВ`),
      no(R`Оставить {{in:U_end}} кВ: напряжение при трансформации не меняется`, 'nn_no_ratio'),
      no(R`Умножить на $\sqrt3$`, 'sqrt3_factor'),
    ],
    explanation: R`Коэффициент трансформации без РПН фиксирован: $k=U_{вн.ном}/U_{нн.ном}={{in:transformer.Uvn}}/{{in:transformer.Unn}}$; $U_{нн}={{in:U_end}}/k={{ref:U_nn|2}}$ кВ.`,
  }),
  T3('q19', {
    type: 'spot_the_error', topic: 'wrong_U_node', difficulty: 3, related_step: 'dS_line',
    stem: R`Итерация 2. Студент посчитал потери в линии при $U_2={{ref:U2@1|1}}$ кВ (конец линии): $\Delta Q_л={{fault:wrong_U_node:dS_line_Q@2|2}}$ Мвар. Где ошибка?`,
    options: [
      ok(R`Потери надо считать при напряжении НАЧАЛА ветви ($U_1={{ref:U1@1|1}}$ кВ, итерация 1): верно {{ref:dS_line_Q@2|2}} Мвар`),
      no(R`Нужно брать $U_{ном}$`, 'nominal_only'),
      no(R`Потери надо прибавить, а не вычесть`, 'direction_sign'),
    ],
    explanation: R`Мощность $S$ на входе линии известна в узле 1, поэтому $U$ в формуле потерь — напряжение узла 1 с предыдущей итерации.`,
  }),
];

/**
 * Переопределения фидбэка: «id вопроса:ключ ошибки» → текст.
 * Нужны там, где универсальный фидбэк из реестра не соответствует формулировке
 * варианта (например, студент УЖЕ разделил на n, а вариант звучит «забыли n»).
 */
export const OVERRIDES = {
  // ── Тест 1 ──
  't1-q09:no_parallel_div': R`Не учтено число трансформаторов: для $n$ параллельных $R_T$ делится на $n$. Без деления $R_T$ = {{fault:no_parallel_div:R_T|2}} Ом вместо {{ref:R_T|2}} Ом — вдвое больше.`,
  't1-q10:parallel_mult': R`Параллельные трансформаторы ДЕЛЯТ $X_T$ на $n$, а не умножают: $X_T=\dfrac{u_кU_{вн}^2}{100S_{ном}n}$. С умножением $X_T$ = {{fault:parallel_mult:X_T|1}} Ом вместо {{ref:X_T|2}} Ом — в {{ratio:parallel_mult:X_T|0}} раза больше.`,
  't1-q13:wrong_px_div': R`Потери реактивной мощности х.х. тоже СКЛАДЫВАЮТСЯ по трансформаторам: $\Delta Q_x=n\dfrac{I_xS_{ном}}{100}$. Деление на $n$ даёт {{fault:wrong_px_div:dQ_x_total|2}} Мвар вместо {{ref:dQ_x_total|2}} Мвар — занижено в {{inv:wrong_px_div:dQ_x_total|0}} раза.`,
  't1-q13:no_parallel_div': R`Число трансформаторов не учтено: $\Delta Q_x$ группы — сумма по трансформаторам. Без $n$ получается {{fault:no_parallel_div:dQ_x_total|2}} Мвар вместо {{ref:dQ_x_total|2}} Мвар — вдвое меньше.`,
  't1-q14:parallel_mult': R`Направление обратное: без деления на $n$ сопротивление БОЛЬШЕ верного, а не меньше, поэтому потери завышены, а не занижены.`,
  't1-q15:wrong_B_div': R`Не «в $n$», а в $n^2$: пропадает и умножение на $n$, и добавляется деление на $n$. {{fault:wrong_B_div:B_half|0}} мкСм вместо {{ref:B_half|0}} мкСм — в {{inv:wrong_B_div:B_half|0}} раза меньше.`,
  't1-q15:parallel_mult': R`Направление обратное: $b_0L/n$ МЕНЬШЕ верного $b_0Ln$, поэтому $Q_c$ занижена, а не завышена.`,
  't1-q17:radius_diameter': R`Радиус действительно нужен, но и единицы важны: отношение $D/r$ безразмерно только при одинаковых единицах, иначе $\lg\frac{8}{12}<0$ и $x_0$ = {{fault:unit_mismatch:x0|3}} Ом/км.`,
  't1-q18:kW_MW': R`Наоборот: $\Delta P_к=0.170$ МВт уже взято в МВт — так и нужно (в кВт результат был бы в 1000 раз больше). Ошибка в потерянных квадратах.`,
  't1-q18:XT_no_100': R`В формуле $R_T$ делителя 100 нет — он бывает только у $X_T$, где $u_к$ задано в процентах. Ошибка — в потерянных квадратах $U_{вн}^2$ и $S_{ном}^2$.`,
  't1-q18:no_parallel_div': R`Число трансформаторов учтено: в знаменателе стоит $n=2$. Ошибка в другом — потеряны квадраты $U_{вн}^2$ и $S_{ном}^2$.`,
  't1-q19:XT_no_100': R`Делитель 100 в подстановке есть ($100\cdot{{in:transformer.Sn}}\cdot{{in:transformer.n}}$). Ошибка в другом — в напряжении.`,
  't1-q19:RT_no_square': R`Квадрат у напряжения есть ($220^2$); ошибочно само напряжение: 220 кВ сети вместо паспортных {{in:transformer.Uvn}} кВ обмотки ВН.`,
  't1-q19:no_parallel_div': R`Число трансформаторов учтено верно (делитель $n=2$ есть). Ошибка — в напряжении: 220 кВ вместо паспортных {{in:transformer.Uvn}} кВ.`,

  // ── Тест 2 ──
  't2-q02:missing_U_square': R`Напряжение не сокращается: оно остаётся в знаменателе в КВАДРАТЕ ($U^2$). Если его потерять, потери завысятся в {{ratio:missing_U_square:dS_line_P|0}} раз.`,
  't2-q08:Qc_sign': R`Это не ошибка: ёмкости линии ГЕНЕРИРУЮТ $Q_c$, поэтому на конце реактивной мощности может быть больше, чем в начале. Ошибкой было бы вычитать $Q_c$: тогда $Q_2$ = {{fault:Qc_sign:S2_Q|1}} Мвар.`,
  't2-q09:Ix_from_P': R`Потери х.х. и ёмкостная проводимость определяются напряжением и паспортом, а не током нагрузки — поэтому они и стоят в узле (поперечно). От тока нагрузки зависят только потери в продольных $R+jX$.`,
  't2-q09:no_parallel_div': R`Делить на $n$ как раз можно и нужно — но только продольные $R$ и $X$; $B$ и потери х.х. умножаются. Место элемента в схеме определяется тем, что он поперечный, а не делением на $n$.`,
  't2-q10:no_parallel_div': R`Это не условность, а физика соединения: параллельные ветви уменьшают сопротивление ($R/n$), а независимые поперечные элементы дают $nB$ и $n\Delta P_x$.`,
  't2-q10:parallel_mult': R`Наоборот: сопротивление параллельных ветвей уменьшается ($R/n$), а проводимость и потери х.х. растут ($nB$, $n\Delta P_x$).`,
  't2-q10:wrong_B_div': R`Цепи ВЛ соединены ПАРАЛЛЕЛЬНО, поэтому их проводимости складываются: $B_л=b_0Ln$. Деление на $n$ было бы у последовательного соединения.`,
  't2-q11:unit_mismatch': R`Единицы согласованы: $P$, $Q$ в МВт и Мвар, $U$ в кВ, $R$ в Омах дают потери сразу в МВт. Перевод в кОм только испортит результат; причина ошибки — в знаменателе ($U^2$).`,
  't2-q11:direction_sign': R`Знак потерь тут ни при чём: величина {{fault:missing_U_square:dS_line_P@1|1}} МВт больше самой передаваемой мощности. Потери на прямом ходе вычитаются, но ошибка — в формуле самих потерь.`,
  't2-q12:no_parallel_div': R`Число цепей уже учтено: $B_л={{ref:B_line|0}}$ мкСм $=b_0Ln$ — именно это значение подставил студент. Ошибка в другом: на узел приходится $B/2$.`,
  't2-q12:wrong_B_div': R`Деление на $n$ занизило бы проводимость: у параллельных цепей $B$ складывается. Ошибка студента — в отсутствии множителя $1/2$ (взято $B_л$, а не $B_л/2$).`,
  't2-q12:Qc_sign': R`Знак верный: ёмкость генерирует, ответ положительный. Ошибка в величине: взято $B_л$ вместо $B_л/2$.`,
  't2-q13:wrong_px_div': R`Делить на $n$ не нужно: $\Delta Q_x$ группы — сумма по трансформаторам (множитель 2 у студента уже есть). Ошибка — в $P$ вместо $S_{ном}$.`,
  't2-q13:XT_no_100': R`Проценты в $\Delta Q_x=\dfrac{nI_xS_{ном}}{100}$ учтены делителем 100 — у студента он есть. Ошибка в другом: взято $P$ вместо $S_{ном}$.`,
  't2-q13:no_parallel_div': R`Число трансформаторов учтено (множитель 2). Ошибка — в $P$ вместо $S_{ном}$.`,
  't2-q14:Ix_from_P': R`В этой схеме замещения потери х.х. — постоянные паспортные величины: они не зависят от нагрузки и в итерациях не пересчитываются.`,
  't2-q14:no_parallel_div': R`Делить нельзя: каждый трансформатор теряет свои $\Delta P_{x1}$, суммарно $n\cdot\Delta P_{x1}$. Деление даёт {{fault:wrong_px_div:dP_x_total|3}} МВт вместо {{ref:dP_x_total|3}} МВт.`,
  't2-q14:kW_MW': R`Перевод сделан верно: 25 кВт = {{fault:wrong_px_div:dP_x_total|3}} МВт. Ошибка не в единицах, а в делении на 2 вместо умножения.`,
  't2-q15:kW_MW': R`При $P$, $Q$ в МВт/Мвар результат сразу в МВт/Мвар: $\dfrac{\text{МВт}^2}{\text{кВ}^2}\cdot\text{Ом}=\text{МВт}$. Умножение на 1000 дало бы кВт — уже другие единицы.`,
  't2-q15:unit_mismatch': R`Переводить кВ в В не нужно: при МВт, кВ и Ом множители $10^6$ сокращаются. Если перевести только $U$, потери стали бы неверными в $10^6$ раз.`,
  't2-q17:losses_independent_of_R': R`Потери нужны именно на ПРЯМОМ ходе: они уменьшают мощность на конце ветви. Обратный ход считает только напряжения (по потоку в конце ветви).`,

  // ── Тест 3 ──
  't3-q02:direction_sign': R`Продольная составляющая ПРИБАВЛЯЕТСЯ к $U_{кон}$: в начале ветви (ближе к источнику) напряжение выше. Знак «минус» дал бы напряжение начала ниже конца — обратное физике.`,
  't3-q02:dU_deltaU_swap': R`Составляющие поменяли роли: к $U_{кон}$ прибавляется ПРОДОЛЬНАЯ $dU$, а поперечная $\delta U$ идёт под корень отдельным слагаемым.`,
  't3-q08:direction_sign': R`Знак потерь мощности тут ни при чём: студент считает напряжение $U_{кон}+dU$. Ошибка — в отброшенной поперечной составляющей $\delta U$.`,
  't3-q08:nn_no_ratio': R`Коэффициент трансформации нужен при пересчёте на сторону НН, а здесь считается напряжение на стороне ВН ($U_2$). Причина ошибки — отброшенная $\delta U$.`,
  't3-q09:direction_sign': R`Знак «−» как раз стоит в формуле поперечной составляющей $\delta U=\dfrac{PX-QR}{U}$ — её студент и написал. Ошибка в том, что это формула $\delta U$, а не $dU$.`,
  't3-q10:dU_deltaU_swap': R`Поперечная составляющая перпендикулярна $U+dU$, поэтому складывается «по Пифагору», а не арифметически: добавка всего $\delta U^2/(2U)$, а не $\delta U$.`,
  't3-q12:no_iteration': R`Число итераций не фиксировано: критерий — сходимость. В эталоне после второй итерации $U_1$ = {{ref:U1@2|1}} кВ, после третьей — {{ref:U1@3|1}} кВ: ещё меняется.`,
  't3-q12:nominal_only': R`Останавливаются не тогда, когда $U$ стало равно $U_{ном}$, а когда оно перестало меняться от итерации к итерации: важна сходимость, а не значение.`,
  't3-q13:wrong_U_node': R`Заданное напряжение относится только к конечной точке и нужно на обратном ходе. В потерях и $Q_c$ на первой итерации для каждого узла берут $U_{ном}$: напряжения узлов ещё неизвестны.`,
  't3-q13:no_iteration': R`При $U=0$ формулы не работают: потери делятся на $U^2$ (деление на ноль), а $Q_c=U^2B/2$ обращается в нуль. Стартуют с номинального напряжения.`,
  't3-q16:direction_sign': R`Если вычесть $dU$, напряжение в начале станет НИЖЕ, чем в конце ветви: $U_{нач}\approx U_{кон}-dU$, а не выше на $2\,dU$.`,
  't3-q16:no_transverse': R`Знак определяет результат: верно $U_{кон}+dU$, ошибочно $U_{кон}-dU$ — разница $2\,dU\approx2\cdot{{ref:dU_T@1|1}}$ кВ. Поперечная составляющая здесь ни при чём.`,
  't3-q17:Qc_sign': R`Зарядная мощность линии, наоборот, поднимает напряжение (эффект Ферранти на слабо нагруженных линиях), а не «всегда роняет». В эталоне $U_2$ выше номинала из-за падения напряжения на трансформаторах.`,
  't3-q17:nominal_only': R`Рабочее напряжение вправе отличаться от номинального: допустимы отклонения порядка ±10–15 %. Значение {{ref:U2@3|0}} кВ укладывается в них.`,
  't3-q17:dU_deltaU_swap': R`Поперечная составляющая перпендикулярна и не складывается арифметически; напряжение превышает номинальное из-за ПРОДОЛЬНОЙ составляющей $dU_T$ на трансформаторах.`,
  't3-q18:sqrt3_factor': R`Множитель $\sqrt3$ связывает линейное и фазное напряжение, а не стороны трансформатора. Пересчёт ВН → НН — по коэффициенту трансформации $U_{нн.ном}/U_{вн.ном}$.`,
  't3-q19:direction_sign': R`Дело не в знаке: потери вычитаются верно. Ошибка — в напряжении, при котором они посчитаны: студент взял конец ветви вместо начала.`,
};
