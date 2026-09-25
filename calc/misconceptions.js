/**
 * Реестр типовых ошибок студентов — ЕДИНЫЙ источник для:
 *   • дистракторов и фидбэка в банке тестов (content-src → content);
 *   • диагностики по числовому ответу (calc/diagnose.js);
 *   • подсказок «типовая ошибка на этом шаге» в пошаговом разборе.
 *
 * Запись:
 *   key          — ключ (используется в JSON банка как `misconception`)
 *   title        — короткое название (для списка «слабые места»)
 *   description  — продолжение фразы «Похоже, вы …» (диагностика)
 *   category     — formula | params | power | voltage | units | concept
 *   numeric      — есть ли у ошибки числовой «отпечаток» на какой-то величине
 *   kinds        — виды шагов разбора, на которых ошибка встречается
 *   probe        — { q, it, tol? }: величина, на которой ошибка ОТЛИЧИМА от верного
 *                  ответа и от других ошибок (проверяется тестами)
 *   feedback     — шаблон фидбэка для неверного варианта (плейсхолдеры — ниже)
 *   transform    — transform(params) → { params, faults }: искажение входа/формул.
 *                  Сами «неправильные формулы» реализованы рядом с правильными
 *                  (calc/params.js, regime.js, network.js, solver.js) под
 *                  флагом faults[key]; transform лишь включает нужный флаг.
 *
 * Плейсхолдеры в feedback (подставляются скриптом сборки банка из движка на
 * эталонном варианте — числа нигде не дублируются руками):
 *   {{ref:Q@it|d}}          верное значение величины Q
 *   {{fault:KEY:Q@it|d}}    значение при ошибке KEY;  self = ключ этой записи,
 *                           probe = её величина-зонд
 *   {{ratio:KEY:Q}}         ошибочное / верное
 *   {{inv:KEY:Q}}           верное / ошибочное
 *   {{pct:KEY:Q}}           |ошибочное − верное| / верное · 100
 *   {{diff:KEY:Q}}          |ошибочное − верное|
 */

const fault = (key) => (params) => ({ params: { ...params }, faults: { [key]: true } });

const REG = [
  // ───────────── потери и напряжения ─────────────
  {
    key: 'missing_U_square', category: 'power', numeric: true, kinds: ['dS_line', 'dS_T'],
    title: 'Потерян квадрат напряжения в знаменателе потерь',
    description: 'потеряли квадрат напряжения в знаменателе: потери надо делить на U², а не на U',
    probe: { q: 'dS_line_P', it: 1 },
    feedback:
      'Вы потеряли квадрат напряжения в знаменателе: $\\Delta S=\\dfrac{P^2+Q^2}{U^2}\\,Z$, а не делить на $U$. ' +
      'При $U=220$ кВ это завысит потери в {{ratio:self:probe|0}} раз: получится {{fault:self:probe|1}} МВт вместо {{ref:probe|2}} МВт — ' +
      'потери больше передаваемой мощности, физически невозможная величина.',
  },
  {
    key: 'missing_PQ_square', category: 'power', numeric: true, kinds: ['dS_line', 'dS_T'],
    title: 'В числителе потерь нет квадратов P и Q',
    description: 'взяли в числителе потерь (P+Q) вместо P²+Q²: квадраты нужны у каждой мощности',
    probe: { q: 'dS_line_P', it: 1 },
    feedback:
      'В числителе нужны квадраты мощностей: $P^2+Q^2$, а не $P+Q$. ' +
      'Получается {{fault:self:probe|4}} МВт вместо {{ref:probe|2}} МВт — потери занижены в {{inv:self:probe|0}} раз.',
  },
  {
    key: 's_instead_of_pq', category: 'concept', numeric: false, kinds: ['dS_line', 'dS_T'],
    title: 'Путают S² и P²+Q²',
    description: 'путаете квадрат комплексной мощности (P+jQ)² и сумму квадратов P²+Q²',
    probe: null,
    feedback:
      'Квадрат комплексного числа $(P+jQ)^2=P^2-Q^2+2jPQ$ — это НЕ то же самое, что $P^2+Q^2$. ' +
      'В формуле потерь стоит квадрат МОДУЛЯ: $|S|^2=P^2+Q^2$ (поэтому $\\Delta S=\\dfrac{S^2}{U^2}Z$ в записи через модуль верна).',
  },
  {
    key: 'wrong_U_node', category: 'power', numeric: true, kinds: ['dS_line', 'dS_T'],
    title: 'Потери посчитаны при напряжении не того узла',
    description: 'посчитали потери ветви при напряжении другого узла (не того, где известна мощность)',
    probe: { q: 'dS_line_Q', it: 2, tol: { pct: 1 } },
    feedback:
      'Потери ветви считаются при напряжении узла, в котором задан поток мощности (начало ветви), значение — с предыдущей итерации. ' +
      'У вас — напряжение другого узла: на итерации 2 получается {{fault:self:probe|3}} Мвар вместо {{ref:probe|3}} Мвар.',
  },
  {
    key: 'direction_sign', category: 'power', numeric: true, kinds: ['dS_line', 'dS_T', 'S_end'],
    title: 'Потери прибавлены при движении от источника',
    description: 'прибавили потери, а не вычли, двигаясь от источника к нагрузке',
    probe: { q: 'S2_Q', it: 1 },
    feedback:
      'На прямом ходе (от источника к нагрузке) потери ВЫЧИТАЮТСЯ: мощность на конце ветви меньше, чем на начале. ' +
      'При сложении получается $Q_2$ = {{fault:self:probe|1}} Мвар вместо {{ref:probe|1}} Мвар.',
  },
  {
    key: 'Qc_no_half', category: 'power', numeric: true, kinds: ['Qc'],
    title: 'Зарядная мощность: взято полное B вместо B/2',
    description: 'взяли полное B вместо B/2: в каждый конец П-схемы идёт половина проводимости',
    probe: { q: 'Qc1', it: 1 },
    feedback:
      'В каждый конец П-схемы идёт ПОЛОВИНА проводимости: $Q_c=U^2\\cdot B/2$. ' +
      'С полным $B$ получается {{fault:self:probe|2}} Мвар вместо {{ref:probe|2}} Мвар — вдвое больше, а на двух концах линии зарядная мощность посчитана дважды.',
  },
  {
    key: 'Qc_sign', category: 'power', numeric: true, kinds: ['Qc', 'S_end'],
    title: 'Зарядная мощность вычтена вместо прибавления',
    description: 'вычли зарядную мощность вместо того, чтобы прибавить: линия её ГЕНЕРИРУЕТ',
    probe: { q: 'S2_Q', it: 1 },
    feedback:
      'Ёмкость линии ГЕНЕРИРУЕТ реактивную мощность: $Q_c$ входит в баланс со знаком «+». ' +
      'При вычитании $Q_2$ получается {{fault:self:probe|1}} Мвар вместо {{ref:probe|1}} Мвар — вы «потеряли» два $Q_c$.',
  },
  {
    key: 'dU_deltaU_swap', category: 'voltage', numeric: true, kinds: ['dU', 'deltaU'],
    title: 'Перепутаны продольная и поперечная составляющие',
    description: 'перепутали составляющие падения напряжения: dU = (PR+QX)/U, δU = (PX−QR)/U',
    probe: { q: 'dU_T', it: 1 },
    feedback:
      'Составляющие перепутаны: продольная $dU=\\dfrac{PR+QX}{U}$ (вдоль вектора напряжения), поперечная $\\delta U=\\dfrac{PX-QR}{U}$. ' +
      'Для трансформатора получается {{fault:self:probe|2}} кВ вместо {{ref:probe|2}} кВ.',
  },
  {
    key: 'no_transverse', category: 'voltage', numeric: true, kinds: ['U_modulus'],
    title: 'Отброшена поперечная составляющая падения напряжения',
    description: 'отбросили поперечную составляющую: U = U_кон + dU — это приближение, а не точное значение',
    probe: { q: 'U2', it: 1, tol: { abs: 0.15 } },
    feedback:
      'Поперечная составляющая отброшена: $U=U_{кон}+dU$ — это приближение. В эталоне оно даёт {{fault:self:probe|2}} кВ вместо {{ref:probe|2}} кВ: ' +
      'занижение всего {{diff:self:probe|2}} кВ (≈ {{pct:self:probe|2}} %) — для оценки на 220 кВ допустимо, но в точном расчёте нужен модуль $\\sqrt{(U+dU)^2+\\delta U^2}$.',
  },
  {
    key: 'nn_no_ratio', category: 'voltage', numeric: true, kinds: ['U_nn'],
    title: 'Напряжение НН без коэффициента трансформации',
    description: 'не пересчитали напряжение на сторону НН через коэффициент трансформации',
    probe: { q: 'U_nn', it: 1 },
    feedback:
      'Напряжение на стороне НН — пересчёт через коэффициент трансформации: $U_{нн}=U\\cdot U_{нн.ном}/U_{вн.ном}=218\\cdot 11/230={{ref:probe|2}}$ кВ, а не {{fault:self:probe|0}} кВ.',
  },

  // ───────────── параметры схемы замещения ─────────────
  {
    key: 'no_parallel_div', category: 'params', numeric: true, kinds: ['R_line', 'X_line', 'B_line', 'R_T', 'X_T', 'dP_x_total', 'dQ_x_total'],
    title: 'Не учтено число параллельных цепей / трансформаторов',
    description: 'забыли учесть число параллельных цепей (трансформаторов): R и X надо делить на n, а B и потери х.х. — умножать',
    probe: { q: 'R_line', it: 1 },
    feedback:
      'Число параллельных цепей/трансформаторов не учтено: для $n$ цепей $R$ и $X$ делятся на $n$, а $B$ и потери х.х. умножаются на $n$. ' +
      'В эталоне $R_л$ = {{fault:self:probe|2}} Ом вместо {{ref:probe|2}} Ом — в {{ratio:self:probe|0}} раза больше, значит и потери в линии завышены вдвое.',
  },
  {
    key: 'parallel_mult', category: 'params', numeric: true, kinds: ['R_line', 'X_line', 'R_T', 'X_T'],
    title: 'R и X умножены на число цепей вместо деления',
    description: 'умножили R и X на число цепей вместо деления: параллельные ветви уменьшают сопротивление',
    probe: { q: 'R_line', it: 1 },
    feedback:
      'При параллельном соединении сопротивление уменьшается: $R_л=R_0L/n$. У вас $R_л$ = {{fault:self:probe|2}} Ом вместо {{ref:probe|2}} Ом — завышено в {{ratio:self:probe|0}} раза.',
  },
  {
    key: 'wrong_B_div', category: 'params', numeric: true, kinds: ['B_line'],
    title: 'B разделили на число цепей вместо умножения',
    description: 'разделили B на число цепей вместо умножения: проводимости параллельных цепей складываются',
    probe: { q: 'B_half', it: 1 },
    feedback:
      'Проводимости параллельных цепей СКЛАДЫВАЮТСЯ: $B_л=b_0Ln$. Деление на $n$ занижает $B/2$ в {{inv:self:probe|0}} раза: {{fault:self:probe|0}} мкСм вместо {{ref:probe|0}} мкСм — и зарядная мощность занижена во столько же.',
  },
  {
    key: 'wrong_px_div', category: 'params', numeric: true, kinds: ['dP_x_total', 'dQ_x_total'],
    title: 'Потери х.х. разделили на n вместо умножения',
    description: 'разделили потери х.х. на число трансформаторов вместо умножения: х.х. каждого трансформатора складывается',
    probe: { q: 'dP_x_total', it: 1 },
    feedback:
      'Потери х.х. параллельных трансформаторов СКЛАДЫВАЮТСЯ: $\\Delta P_x=n\\,\\Delta P_{x1}$ (каждый сердечник намагничивается независимо). ' +
      'Деление на $n$ даёт {{fault:self:probe|3}} МВт вместо {{ref:probe|3}} МВт — занижено в {{inv:self:probe|0}} раза.',
  },
  {
    key: 'RT_no_square', category: 'params', numeric: true, kinds: ['R_T'],
    title: 'В R_T потеряны квадраты U_вн и S_ном',
    description: 'потеряли квадраты U_вн и S_ном в формуле R_T',
    probe: { q: 'R_T', it: 1 },
    feedback:
      'Потеряны квадраты: $R_T=\\dfrac{\\Delta P_к\\,U_{вн}^2}{S_{ном}^2\\,n}$. Без них $R_T$ = {{fault:self:probe|2}} Ом вместо {{ref:probe|2}} Ом (в {{inv:self:probe|1}} раза меньше) — потери в обмотках занижены.',
  },
  {
    key: 'XT_no_100', category: 'params', numeric: true, kinds: ['X_T'],
    title: 'В X_T забыт делитель 100 (проценты)',
    description: 'забыли делитель 100 в X_T: напряжение короткого замыкания u_к дано в процентах',
    probe: { q: 'X_T', it: 1 },
    feedback:
      'В $X_T=\\dfrac{u_к[\\%]\\,U_{вн}^2}{100\\,S_{ном}\\,n}$ забыт делитель 100: $u_к$ дано в процентах. $X_T$ = {{fault:self:probe|0}} Ом вместо {{ref:probe|2}} Ом — завышено ровно в {{ratio:self:probe|0}} раз.',
  },
  {
    key: 'XT_wrong_U', category: 'params', numeric: true, kinds: ['X_T'],
    title: 'В X_T взято 220 кВ вместо паспортного U_вн = 230 кВ',
    description: 'подставили в X_T номинальное напряжение сети 220 кВ вместо паспортного U_вн = 230 кВ',
    probe: { q: 'X_T', it: 1 },
    feedback:
      'В $X_T$ нужно брать паспортное $U_{вн}=230$ кВ (обмотка ВН трансформатора), а не номинальное напряжение сети 220 кВ. ' +
      'Получается {{fault:self:probe|2}} Ом вместо {{ref:probe|2}} Ом (занижено на {{pct:self:probe|1}} %).',
  },
  {
    key: 'Ix_from_P', category: 'params', numeric: true, kinds: ['dQ_x_total'],
    title: 'ΔQ_x посчитана от активной мощности, а не от S_ном',
    description: 'посчитали потери реактивной мощности х.х. от активной мощности, а не от полной S_ном',
    probe: { q: 'dQ_x_total', it: 1 },
    feedback:
      'Потери реактивной мощности х.х. берутся от ПОЛНОЙ номинальной мощности: $\\Delta Q_x=n\\,I_x\\,S_{ном}/100$ (ток намагничивания создаёт реактивную мощность). ' +
      'От активной мощности получается {{fault:self:probe|2}} Мвар вместо {{ref:probe|2}} Мвар — да ещё и зависящая от нагрузки, а это паспортный параметр.',
  },
  {
    key: 'radius_diameter', category: 'params', numeric: true, kinds: ['lg_ratio', 'x0', 'b0'],
    title: 'В lg(D/r) подставлен диаметр вместо радиуса',
    description: 'подставили в lg(D/r) диаметр провода вместо радиуса',
    probe: { q: 'x0', it: 1 },
    feedback:
      'В $\\lg\\dfrac{D_{ср}}{r}$ стоит РАДИУС провода, а не диаметр: $r=d/2=12$ мм. С диаметром $x_0$ = {{fault:self:probe|3}} Ом/км вместо {{ref:probe|3}} Ом/км (занижено), а $b_0$ — завышено.',
  },
  {
    key: 'unit_mismatch', category: 'units', numeric: true, kinds: ['lg_ratio', 'x0', 'b0'],
    title: 'D_ср в метрах, а r в миллиметрах',
    description: 'подставили D_ср в метрах, а радиус в миллиметрах — без приведения к одним единицам',
    probe: { q: 'x0', it: 1 },
    feedback:
      '$D_{ср}$ и $r$ должны быть в ОДНИХ единицах. Подстановка $D=8$ (м) и $r=12$ (мм) даёт $\\lg\\frac{8}{12}<0$ и $x_0$ = {{fault:self:probe|3}} Ом/км — нулевое или отрицательное сопротивление, физически бессмысленно. Верно: $D=8000$ мм.',
  },
  {
    key: 'log_ln', category: 'formula', numeric: true, kinds: ['lg_ratio', 'x0', 'b0'],
    title: 'Натуральный логарифм вместо десятичного',
    description: 'взяли натуральный логарифм ln вместо десятичного lg',
    probe: { q: 'x0', it: 1 },
    feedback:
      'В формулах $x_0$ и $b_0$ — ДЕСЯТИЧНЫЙ логарифм $\\lg$, а не натуральный $\\ln$. С $\\ln$: $x_0$ = {{fault:self:probe|3}} Ом/км вместо {{ref:probe|3}} Ом/км.',
  },
  {
    key: 'kW_MW', category: 'units', numeric: true, kinds: ['R_T'],
    title: 'ΔP_к подставлено в кВт вместо МВт',
    description: 'подставили ΔP_к в кВт: в формулу с МВА и кВ нужны МВт',
    probe: { q: 'R_T', it: 1 },
    feedback:
      'ΔP_к подставлено в кВт, а в формулу с $S$ в МВА и $U$ в кВ нужны МВт (тогда $R_T$ сразу в Омах). $R_T$ = {{fault:self:probe|0}} Ом вместо {{ref:probe|2}} Ом — в {{ratio:self:probe|0}} раз больше.',
  },

  // ───────────── понятийные ошибки (без числового отпечатка) ─────────────
  {
    key: 'shunt_in_branch', category: 'concept', numeric: false, kinds: ['scheme'],
    title: 'B/2 и потери х.х. помещены в продольную ветвь',
    description: 'поместили B/2 и потери х.х. в продольную ветвь схемы замещения',
    probe: null,
    feedback:
      '$B/2$ и потери х.х. — ПОПЕРЕЧНЫЕ (шунтирующие) элементы: ток заряда и ток х.х. текут на землю, а не вдоль ветви, поэтому они сидят в УЗЛАХ схемы замещения, а не в продольной ветви $R+jX$.',
  },
  {
    key: 'no_iteration', category: 'concept', numeric: false, kinds: ['convergence'],
    title: 'Считают, что итерации не нужны',
    description: 'считаете, что расчёт можно закончить за один проход без итераций',
    probe: null,
    feedback:
      'Потери и зарядная мощность зависят от напряжения, а напряжения — от потерь: замкнутая зависимость. Сначала берут номинальные напряжения и уточняют их по итерациям: ' +
      'в эталоне $Q_{c1}$ меняется с {{ref:Qc1@1|2}} до {{ref:Qc1@3|2}} Мвар, а $U_1$ — с {{ref:U1@1|1}} до {{ref:U1@3|1}} кВ.',
  },
  {
    key: 'nominal_only', category: 'concept', numeric: false, kinds: ['convergence', 'Qc', 'dS_line'],
    title: 'На всех итерациях берут номинальное напряжение',
    description: 'не обновляете напряжения между итерациями и берёте U_ном на каждом проходе',
    probe: null,
    feedback:
      'Смысл итераций — подставлять в потери и $Q_c$ напряжения, найденные на ПРЕДЫДУЩЕЙ итерации. Если на каждом проходе брать $U_{ном}$, результат не меняется и «сходимости» нет: ' +
      'в эталоне $Q_{c1}$ должна вырасти с {{ref:Qc1@1|2}} до {{ref:Qc1@3|2}} Мвар.',
  },
  {
    key: 'sqrt3_factor', category: 'concept', numeric: false, kinds: ['dS_line', 'dU'],
    title: 'Лишний √3 в формулах мощности и падения напряжения',
    description: 'добавили лишний множитель √3 там, где формулы уже записаны для трёхфазной мощности и линейного напряжения',
    probe: null,
    feedback:
      'Формулы записаны для ТРЁХФАЗНОЙ мощности и ЛИНЕЙНОГО напряжения ($S=\\sqrt3 UI$ уже «спрятан» внутри): $\\Delta S=\\dfrac{P^2+Q^2}{U^2}Z$ и $dU=\\dfrac{PR+QX}{U}$. Дополнительный $\\sqrt3$ или множитель 3 не нужен.',
  },
  {
    key: 'losses_independent_of_R', category: 'concept', numeric: false, kinds: ['dS_line'],
    title: 'Думают, что сопротивление не влияет на потери',
    description: 'считаете, что потери в ветви не зависят от её сопротивления',
    probe: null,
    feedback: 'Потери пропорциональны сопротивлению: $\\Delta S=\\dfrac{P^2+Q^2}{U^2}(R+jX)$. Ошибка в $R$ или $X$ переносится в потери линейно (в 2 раза больше $R$ — в 2 раза больше $\\Delta P$).',
  },
].map((e) => ({ ...e, transform: fault(e.key) }));

/** Ключи, обязательные по спецификации §5.2 (20 штук). */
export const REQUIRED_KEYS = [
  'missing_U_square', 'missing_PQ_square', 's_instead_of_pq', 'no_parallel_div', 'wrong_B_div', 'wrong_px_div',
  'RT_no_square', 'XT_no_100', 'XT_wrong_U', 'Ix_from_P', 'Qc_no_half', 'Qc_sign', 'radius_diameter',
  'unit_mismatch', 'log_ln', 'dU_deltaU_swap', 'no_transverse', 'wrong_U_node', 'direction_sign', 'kW_MW',
];

export const MISCONCEPTIONS = Object.fromEntries(REG.map((e) => [e.key, e]));
export const listMisconceptions = () => REG.slice();
export const numericMisconceptions = () => REG.filter((e) => e.numeric);

/** Ошибки, встречающиеся на шаге данного вида (для подсказки «типовая ошибка»). */
export const misconceptionsForKind = (kind) => REG.filter((e) => e.kinds.includes(kind));
