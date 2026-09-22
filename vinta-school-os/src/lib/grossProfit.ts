/**
 * Vinta School OS — Gross-profit toggle (frontend-only registry)
 * Academy-level opt-in: OFF by default. When OFF the commission model UI
 * is hidden everywhere and no gross/cut math is shown. When ON, teachers
 * carry an optional commission model and payout gross/cut figures render.
 * Stored per academy in localStorage (backend untouched, no migration).
 */

const KEY = 'vinta:gross-profit:v1'

interface Store {
  [academyId: string]: { enabled: boolean; updatedAt: string }
}

function currentAcademy(): string {
  try {
    return (
      localStorage.getItem('vinta_academy_id') ??
      localStorage.getItem('vinta:academy-id') ??
      localStorage.getItem('academy_id') ??
      localStorage.getItem('academyId') ??
      'default'
    )
  } catch {
    return 'default'
  }
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function save(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // Storage blocked — toggle still applies for this tab
  }
}

/** Academy-level opt-in. OFF by default — no gross/cut math shown. */
export function isGrossProfitEnabled(academyId?: string): boolean {
  const id = academyId ?? currentAcademy()
  return load()[id]?.enabled ?? false
}

export function setGrossProfitEnabled(enabled: boolean, academyId?: string): void {
  const id = academyId ?? currentAcademy()
  const store = load()
  store[id] = { enabled, updatedAt: new Date().toISOString() }
  save(store)
}
