/**
 * Vinta School OS — Session change bus
 *
 * The Calendar page owns scheduling (add / remove / change time) and the
 * Dashboard owns the session lifecycle (start / end / report / add time).
 * Both draw the same sessions, so a change made in one has to be visible in
 * the other. Each page already refetches on mount, which covers navigation —
 * this bus covers the rest (a page that is already mounted, or a future
 * split view) without dragging in a store the two pages would then share.
 *
 * Payload is intentionally just the origin: listeners refetch from the API
 * rather than trusting a locally-patched copy of the row.
 */

const SESSION_CHANGED_EVENT = 'vinta:sessions-changed'

export type SessionChangeSource = 'calendar' | 'dashboard'

/** Announce that the session set changed. Safe to call with no listeners. */
export function notifySessionsChanged(source: SessionChangeSource): void {
  try {
    window.dispatchEvent(
      new CustomEvent<{ source: SessionChangeSource }>(SESSION_CHANGED_EVENT, {
        detail: { source },
      }),
    )
  } catch {
    // Non-browser environment (tests, SSR) — nothing to notify.
  }
}

/**
 * Listen for session changes. Returns an unsubscribe function.
 * `handler` receives the origin so a page can skip its own echo.
 */
export function subscribeSessionsChanged(
  handler: (source: SessionChangeSource) => void,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ source?: SessionChangeSource }>).detail
    handler(detail?.source ?? 'calendar')
  }
  window.addEventListener(SESSION_CHANGED_EVENT, listener)
  return () => window.removeEventListener(SESSION_CHANGED_EVENT, listener)
}
