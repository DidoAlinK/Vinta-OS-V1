/**
 * Vinta School OS — Teacher colours
 *
 * The teacher record has no colour column, so the calendar's teacher filter
 * needs one derived. Hashing the id keeps a teacher's swatch stable across
 * reloads and pages — picking a colour at render time from an index would
 * repaint every chip the moment the roster is re-ordered.
 */

/** Palette drawn from the app's own tokens so the chips sit in the theme. */
export const TEACHER_PALETTE = [
  '#7c3aed', // violet
  '#0ea5e9', // sky
  '#b3872a', // gold
  '#0f6b4d', // emerald
  '#db2777', // pink
  '#0d9488', // teal
  '#e07a6f', // clay
  '#6366f1', // indigo
] as const

/** Stable colour for a teacher id. */
export function teacherColor(teacherId: string | undefined | null): string {
  if (!teacherId) return 'var(--muted)'
  let hash = 0
  for (let i = 0; i < teacherId.length; i++) {
    hash = (hash * 31 + teacherId.charCodeAt(i)) >>> 0
  }
  return TEACHER_PALETTE[hash % TEACHER_PALETTE.length]
}

/** Hex → rgba, used to tint a block without losing the theme. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = (hex || '').replace('#', '')
  if (h.length !== 6) return `rgba(117, 114, 106, ${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
