/**
 * Vinta School OS — Notification Bell
 *
 * The top-bar bell and its dropdown. The whole point of this component is that
 * the dot on the bell means something: it is drawn only when the server says
 * there is something unread, and it goes away when the desk has dealt with it.
 *
 * It was a permanent red dot before — a `<span>` with no condition and no
 * click handler. A dot that is always on carries exactly as much information as
 * a dot that is always off, and worse, it teaches the desk to ignore the one
 * place the app has to say something needs attention. The API to back it
 * already existed and was simply never called.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bell,
  CreditCard,
  Clock,
  UserPlus,
  AlertCircle,
  CheckCheck,
  X,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import type { Notification } from '../../types/settings'

/* ─── Presentation per notification type ─── */

const TYPE_STYLE: Record<Notification['type'], { icon: React.ElementType; classes: string }> = {
  payment_reminder: { icon: CreditCard, classes: 'bg-[var(--emerald-soft)] text-[var(--emerald)]' },
  class_ending: { icon: Clock, classes: 'bg-[var(--gold-soft)] text-[var(--gold)]' },
  enrollment_request: { icon: UserPlus, classes: 'bg-[var(--violet-soft)] text-[var(--violet)]' },
  overdue_alert: { icon: AlertCircle, classes: 'bg-[var(--red-soft)] text-[var(--red)]' },
  general: { icon: Bell, classes: 'bg-[var(--glass-strong)] text-[var(--muted)]' },
}

function styleFor(type: Notification['type']) {
  // A type the server adds later must render as a generic bell, not crash the
  // panel — the enum is the server's to extend.
  return TYPE_STYLE[type] ?? TYPE_STYLE.general
}

/* ─── Relative time ─── */

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 0) return 'just now'

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString()
}

/* ─── Poll cadence ───
   A count is a cheap query, so this is not a load concern — but a bell that
   only updates on a page reload is the same broken promise in slower motion.
   A minute is the point where the dot is current enough to act on without the
   request showing up in anyone's logs as a loop. */
const POLL_MS = 60_000

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  /* The dot reads from this and nothing else. Failures leave the last known
     count alone rather than zeroing it: a dropped request is not news that
     everything has been read. */
  const refreshCount = useCallback(async () => {
    try {
      const { data } = await api.get<{ unread_count: number }>(
        '/notifications/unread-count',
      )
      setUnread(data.unread_count ?? 0)
    } catch {
      // Keep the count we last trusted.
    }
  }, [])

  const loadList = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data } = await api.get<{ notifications: Notification[] }>('/notifications')
      setItems(data.notifications ?? [])
    } catch {
      // Leave the previous list up rather than blanking it on a transient error.
    } finally {
      setIsLoading(false)
    }
  }, [])

  /* Poll the count whether or not the panel is open — the dot is the whole
     point, and it is on screen the entire time. */
  useEffect(() => {
    void refreshCount()
    const handle = setInterval(() => void refreshCount(), POLL_MS)
    return () => clearInterval(handle)
  }, [refreshCount])

  /* Opening is what fetches the list, and it re-counts on the way in so the
     panel and the dot never disagree at the moment the desk looks at them. */
  useEffect(() => {
    if (!open) return
    void loadList()
    void refreshCount()
  }, [open, loadList, refreshCount])

  /* Dismissal: click outside, or Escape. Both are needed — a dropdown that
     cannot be closed without picking something is a trap on a page whose whole
     job is triage. */
  useEffect(() => {
    if (!open) return

    function onPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const markRead = useCallback(async (id: string) => {
    // Optimistic: the row greys out immediately because waiting on a round trip
    // to strike through a line makes the panel feel broken. If the write fails,
    // the list is re-fetched rather than patched back — one request that makes
    // both the row and the dot true again beats guessing at a rollback.
    setItems(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)))
    setUnread(prev => Math.max(0, prev - 1))
    try {
      await api.post(`/notifications/${id}/read`)
    } catch {
      void loadList()
    }
    void refreshCount()
  }, [loadList, refreshCount])

  const markAllRead = useCallback(async () => {
    setItems(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnread(0)
    try {
      await api.post('/notifications/read-all')
    } catch {
      void loadList()
    }
    void refreshCount()
  }, [loadList, refreshCount])

  const hasUnread = unread > 0

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          hasUnread ? `Notifications, ${unread} unread` : 'Notifications'
        }
        title={hasUnread ? `${unread} unread` : 'Notifications'}
        className={cn(
          'relative p-2 rounded-full transition-colors duration-150',
          'hover:bg-[var(--glass-strong)]',
        )}
        style={{ color: open ? 'var(--text)' : 'var(--muted)' }}
      >
        <Bell size={18} />
        {/* Drawn only when there is something to say. No unread, no dot. */}
        {hasUnread && (
          <span
            className={cn(
              'absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-1',
              'rounded-full flex items-center justify-center',
              'text-[9px] font-bold leading-none text-white tabular-nums',
            )}
            style={{ background: 'var(--red)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={cn(
            'absolute right-0 top-full mt-2 z-50 w-[340px] max-w-[calc(100vw-2rem)]',
            'rounded-[var(--radius-lg)] overflow-hidden',
            'border border-[var(--glass-border)]',
            'bg-[var(--card-bg)]',
            'shadow-xl',
          )}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-[var(--glass-border)] flex items-center justify-between gap-2">
            <h3
              className="text-sm font-semibold text-[var(--text)]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Notifications
            </h3>
            <div className="flex items-center gap-1">
              {hasUnread && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-lg text-[11px]',
                    'text-[var(--muted)] hover:text-[var(--text)]',
                    'hover:bg-[var(--glass-strong)] transition-colors duration-150',
                  )}
                >
                  <CheckCheck size={12} />
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className={cn(
                  'p-1 rounded-lg text-[var(--muted)] hover:text-[var(--text)]',
                  'hover:bg-[var(--glass-strong)] transition-colors duration-150',
                )}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[380px] overflow-y-auto">
            {isLoading && items.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-[var(--muted)]">Loading…</p>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="w-4 h-4 mx-auto mb-2 text-[var(--muted)]" />
                <p className="text-xs text-[var(--muted)]">Nothing to report</p>
              </div>
            ) : (
              items.map(n => {
                const { icon: Icon, classes } = styleFor(n.type)
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => !n.is_read && void markRead(n.id)}
                    className={cn(
                      'w-full text-left flex gap-3 px-4 py-3',
                      'border-b border-[var(--glass-border)] last:border-b-0',
                      'transition-colors duration-150',
                      n.is_read
                        ? 'opacity-55 hover:bg-[var(--glass)]'
                        : 'hover:bg-[var(--glass-strong)]',
                    )}
                  >
                    <div
                      className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                        classes,
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <p
                          className={cn(
                            'text-[12px] leading-snug flex-1 min-w-0',
                            n.is_read
                              ? 'font-normal text-[var(--muted)]'
                              : 'font-semibold text-[var(--text)]',
                          )}
                        >
                          {n.title}
                        </p>
                        {/* The unread marker is the row's own dot, so it is
                            visible in the list and not only on the bell. */}
                        {!n.is_read && (
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                            style={{ background: 'var(--red)' }}
                          />
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--muted)] mt-0.5 break-words">
                        {n.message}
                      </p>
                      <p className="text-[10px] text-[var(--muted)]/70 mt-1">
                        {relativeTime(n.created_at)}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
