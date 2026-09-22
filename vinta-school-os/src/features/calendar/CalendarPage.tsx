/**
 * Vinta School OS — Calendar Page (Disabled)
 * This module is being rebuilt with new scheduling logic.
 * Shows a "Coming Soon" placeholder state.
 */

import { Calendar } from 'lucide-react'

export default function CalendarPageContainer() {
  return (
    <div className="h-full flex flex-col items-center justify-center animate-fade-in px-6">
      <div className="max-w-md w-full text-center">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)' }}
        >
          <Calendar size={36} className="text-[var(--muted)]" style={{ opacity: 0.5 }} />
        </div>
        <h1
          className="text-2xl font-bold text-[var(--text)] mb-3"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          Calendar
        </h1>
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-4"
          style={{
            background: 'var(--gold-soft)',
            color: 'var(--gold)',
            border: '1px solid color-mix(in srgb, var(--gold) 20%, transparent)',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)]" />
          Coming Soon
        </div>
        <p className="text-sm text-[var(--muted)] leading-relaxed mb-2">
          The Calendar module is being rebuilt with new scheduling logic.
        </p>
        <p className="text-xs text-[var(--muted)]" style={{ opacity: 0.6 }}>
          Session management, attendance tracking, and drag-and-drop scheduling will be available here.
        </p>
      </div>
    </div>
  )
}
