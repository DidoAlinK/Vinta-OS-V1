/**
 * Vinta School OS — a shared "what time is it" tick.
 *
 * A session's *phase* (`lib/sessionLifecycle.ts`) is derived from the clock:
 * a class is `live` until its end time passes and `overdue` after. So anything
 * that renders a phase has to re-render when the clock crosses that boundary.
 * Without a tick it only re-evaluates on a refetch or a reload, which is how a
 * class that ended at 09:00 was still being drawn as running at 11:00 — the
 * staleness this was written to fix. Refetching is not a substitute: the data
 * has not changed, only the time.
 *
 * ONE interval for the whole page, not one per card. A busy Classrooms tab
 * renders dozens of cards, and a timer each would mean dozens of wakeups a
 * minute to compute the same instant. Tickers are keyed by period at module
 * scope, so every component asking for the same tick shares one `setInterval`,
 * and the interval is torn down when the last subscriber goes away.
 */

import { useEffect, useState } from 'react'

type Listener = () => void

interface Ticker {
  listeners: Set<Listener>
  timer: ReturnType<typeof setInterval>
}

/** period in ms → the single ticker serving it. */
const tickers = new Map<number, Ticker>()

function subscribe(intervalMs: number, listener: Listener): () => void {
  let ticker = tickers.get(intervalMs)
  if (!ticker) {
    const listeners = new Set<Listener>()
    ticker = {
      listeners,
      timer: setInterval(() => {
        // Copy before iterating: a listener may unsubscribe as it runs (a card
        // that unmounts because the phase change removed it), and mutating a
        // Set mid-iteration would skip the next listener.
        for (const fn of Array.from(listeners)) fn()
      }, intervalMs),
    }
    tickers.set(intervalMs, ticker)
  }
  ticker.listeners.add(listener)

  return () => {
    const current = tickers.get(intervalMs)
    if (!current) return
    current.listeners.delete(listener)
    if (current.listeners.size === 0) {
      clearInterval(current.timer)
      tickers.delete(intervalMs)
    }
  }
}

/**
 * The current time, refreshed every `intervalMs`.
 *
 * Defaults to a minute — fine enough that a lamp changes within a minute of a
 * class ending, coarse enough that a grid of cards is not re-rendering every
 * second to do nothing.
 */
export function useNow(intervalMs: number = 60_000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    return subscribe(intervalMs, () => setNow(new Date()))
  }, [intervalMs])

  return now
}

export default useNow
