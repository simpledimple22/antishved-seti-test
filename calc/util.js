// Мелкие общие утилиты. Без DOM и без сети.

/** Округление до d знаков. */
export const round = (x, d = 2) => {
  const k = 10 ** d;
  return Math.round(x * k) / k;
};

/** Число → строка с точкой и фиксированным числом знаков. */
export const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : String(x));

/** Комплексная мощность вида «P + jQ» для текста. */
export const fmtS = (S, d = 2) =>
  `${fmt(S.P, d)} ${S.Q < 0 ? '−' : '+'} j${fmt(Math.abs(S.Q), d)}`;

/** Относительное отклонение |a-b| / |b|. */
export const relErr = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);

/**
 * Детерминированный ГПСЧ mulberry32: одинаковый seed -> одинаковая последовательность.
 * @param {number} seed
 * @returns {() => number} функция, возвращающая число в [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Хэш строки в uint32 (FNV-1a) — чтобы смешивать seed и тип задачи. */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
