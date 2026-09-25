/**
 * Модель сети и сборка её из «варианта задачи».
 *
 * Сеть — цепочка «узел – ветвь – узел – …» (тип A и тип B описываются ОДНОЙ
 * моделью, отличается только конфигурация):
 *
 *   Node   { id, U_nom, shunt:{B_half, dP_x, dQ_x}, load:{P,Q}|null }
 *   Branch { id, kind:'line'|'transformer', from, to, R, X, n_parallel }
 *   boundary { S_start:{P,Q}  — мощность источника в головном узле,
 *              U_end          — напряжение в конечном узле }
 *
 * Ветвь хранит УЖЕ приведённые (эффективные) R и X — деление на число цепей
 * выполнено при сборке; n_parallel остаётся метаданными для пошагового разбора.
 * Шунты (B/2, потери х.х.) сидят в УЗЛАХ, а не в ветвях.
 *
 * Варианты:
 *   A: { type:'A', U_nom, wire, L, n_line, transformer, S_start:{P,tgphi}, U_end }
 *   B: { type:'B', U_nom, lines:[{wire,L,n},{wire,L,n}], mid_load:{P,tgphi},
 *        S_start:{P,tgphi}, U_end }
 *   wire = { name, R0, d_mm, D_m },
 *   transformer = { name, n, dPk_kW, uk_pct, dPx_kW, Ix_pct, Uvn, Unn, Sn }
 */
import * as prm from './params.js';

/** Параметры одной линии (ВЛ) из паспортных данных. */
export function lineParams(wire, L, n, faults = {}) {
  const { D, r } = prm.wireGeometry(wire, faults);
  const lg = prm.lgRatio(D, r, faults);
  const x0v = prm.x0(D, r, faults);
  const b0v = prm.b0(D, r, faults);
  const R = prm.R_line(wire.R0, L, n, faults);
  const X = prm.X_line(x0v, L, n, faults);
  const B = prm.B_line(b0v, L, n, faults);
  return { kind: 'line', wire, L, n, D, r, lg, x0: x0v, b0: b0v, R0: wire.R0, R, X, B, B_half: B / 2 };
}

/**
 * Параметры группы из n параллельных трансформаторов.
 * Ошибка kW_MW: ΔP_к подставлено в кВт (без перевода в МВт).
 * @param {{P?:number}} ctx  P — активная мощность на входе в трансформатор (для Ix_from_P);
 *                           U_nom — номинальное напряжение сети (для XT_wrong_U)
 */
export function transformerParams(t, faults = {}, ctx = {}) {
  const dPk_MW = faults.kW_MW ? t.dPk_kW : t.dPk_kW / 1000;
  const dPx1_MW = t.dPx_kW / 1000;
  return {
    kind: 'transformer',
    t,
    n: t.n,
    dPk_MW,
    dPx1_MW,
    R: prm.R_T(dPk_MW, t.Uvn, t.Sn, t.n, faults),
    X: prm.X_T(t.uk_pct, t.Uvn, t.Sn, t.n, faults, ctx),
    dP_x: prm.dP_x_total(dPx1_MW, t.n, faults),
    dQ_x: prm.dQ_x_total(t.Ix_pct, t.Sn, t.n, faults, ctx),
  };
}

const zeroShunt = () => ({ B_half: 0, dP_x: 0, dQ_x: 0 });

/**
 * Собрать сеть из варианта.
 * @param {object} variant
 * @param {object} [faults]  типовые ошибки (для тестов-дистракторов и диагностики)
 * @param {object} [ctx]     доп. контекст ({P} для Ix_from_P)
 * @returns {{nodes, branches, boundary, meta}}
 */
export function buildNetwork(variant, faults = {}, ctx = {}) {
  const U_nom = variant.U_nom;
  const S_start = { P: variant.S_start.P, Q: variant.S_start.P * variant.S_start.tgphi };
  const boundary = { S_start, U_end: variant.U_end };
  const nodes = [];
  const branches = [];
  const meta = { type: variant.type, U_nom, S_start, lines: [], transformer: null };
  const newNode = (load = null) => {
    const n = { id: nodes.length + 1, U_nom, shunt: zeroShunt(), load };
    nodes.push(n);
    return n;
  };

  if (variant.type === 'A') {
    const line = lineParams(variant.wire, variant.L, variant.n_line, faults);
    const tr = transformerParams(variant.transformer, faults, { U_nom, ...ctx });
    meta.lines.push(line);
    meta.transformer = tr;
    const n1 = newNode();
    const n2 = newNode();
    const n3 = newNode();
    n1.shunt.B_half += line.B_half; // B/2 — в оба конца линии
    n2.shunt.B_half += line.B_half;
    n2.shunt.dP_x = tr.dP_x; //        потери х.х. — в узле 2 (сторона ВН)
    n2.shunt.dQ_x = tr.dQ_x;
    n3.U_nom = variant.U_end; //         точка «за сопротивлением обмоток» — напряжение задано
    branches.push({ id: '1-2', kind: 'line', from: 1, to: 2, R: line.R, X: line.X, n_parallel: line.n });
    branches.push({ id: '2-3', kind: 'transformer', from: 2, to: 3, R: tr.R, X: tr.X, n_parallel: tr.n });
  } else if (variant.type === 'B') {
    const l1 = lineParams(variant.lines[0].wire, variant.lines[0].L, variant.lines[0].n, faults);
    const l2 = lineParams(variant.lines[1].wire, variant.lines[1].L, variant.lines[1].n, faults);
    meta.lines.push(l1, l2);
    const load = { P: variant.mid_load.P, Q: variant.mid_load.P * variant.mid_load.tgphi };
    const n1 = newNode();
    const n2 = newNode(load);
    const n3 = newNode();
    n1.shunt.B_half += l1.B_half;
    n2.shunt.B_half += l1.B_half + l2.B_half;
    n3.shunt.B_half += l2.B_half;
    n3.U_nom = variant.U_end;
    branches.push({ id: '1-2', kind: 'line', from: 1, to: 2, R: l1.R, X: l1.X, n_parallel: l1.n });
    branches.push({ id: '2-3', kind: 'line', from: 2, to: 3, R: l2.R, X: l2.X, n_parallel: l2.n });
  } else {
    throw new Error(`Неизвестный тип задачи: ${variant.type}`);
  }
  return { nodes, branches, boundary, meta };
}
