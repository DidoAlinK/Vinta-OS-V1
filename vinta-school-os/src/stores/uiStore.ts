/**
 * Vinta School OS — UI Store
 * Sidebar state, modals, toasts, and global UI state
 */

import { create } from 'zustand'
import type { Class } from '../types/class'
import type { Student } from '../types/student'
import type { Teacher } from '../types/teacher'

// ============================================
// Cross-page focus handoff
// ============================================

/**
 * "Go to this tab and open this record."
 *
 * The global search needs to do that, and nothing in the app could: no page
 * reads a URL param or navigation state to open a record, and the drawers and
 * panels all require the entity itself — `StudentDrawer` renders nothing at all
 * without one. So the record travels, not just its id.
 *
 * Carrying the entity is also what keeps this to one request. The search
 * already fetched these rows from the same list endpoints the pages use, so
 * handing the object over costs nothing and the target page opens instantly.
 * An id alone would mean a second `GET /students/:id` on arrival — or a page
 * that has to build a fake record good enough to satisfy the drawer's types.
 *
 * The payload is live data from the search, not a cached copy, so it cannot go
 * stale behind an edit the way a persisted store could.
 */
export type FocusTarget =
  | { kind: 'student'; student: Student }
  | { kind: 'teacher'; teacher: Teacher }
  | { kind: 'class'; cls: Class }

// ============================================
// Toast Types
// ============================================

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastAction {
  label: string
  /** Called when the action button is clicked. Dismisses the toast afterwards by default. */
  onClick: () => void
  /** Primary actions render gold; secondary render ghost. */
  primary?: boolean
  /** When true, the toast stays until dismissed (no auto-remove). */
  keepOnClick?: boolean
}

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
  actions?: ToastAction[]
  /**
   * Identity for a toast that asks a question, so asking it again replaces
   * the copy already on screen instead of stacking a second one under it.
   *
   * Needed because the lifecycle notifier re-asks until the desk answers
   * (see `lib/sessionNotifier.ts`): without this, one class left overnight
   * would build a column of identical prompts, each with its own buttons,
   * and the desk would have to dismiss the same question once per copy.
   *
   * Unkeyed toasts are unaffected and still stack — that is right for
   * notices, which are about things that happened at different times.
   * Keyed ones are about a *state*, so only the newest copy is true.
   */
  key?: string
}

/** Everything a caller can pass; the store assigns the id. */
export type ToastOptions = Omit<Toast, 'id' | 'type' | 'title' | 'message'>

// ============================================
// UI State
// ============================================

interface UIState {
  // Sidebar
  sidebarOpen: boolean
  mobileSidebarOpen: boolean
  currentPage: string

  // Modals
  activeModal: string | null
  modalData: unknown

  // Toasts
  toasts: Toast[]

  // Search filters (page-local filter pills; the search box lives in GlobalSearch)
  searchFilter: string
  statusFilter: string

  // Cross-page focus handoff (see FocusTarget above)
  focusTarget: FocusTarget | null

  // Actions
  setSidebarOpen: (open: boolean) => void
  setMobileSidebarOpen: (open: boolean) => void
  setCurrentPage: (page: string) => void
  openModal: (modalId: string, data?: unknown) => void
  closeModal: () => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  setSearchFilter: (filter: string) => void
  setStatusFilter: (filter: string) => void
  setFocusTarget: (target: FocusTarget) => void
  clearFocusTarget: () => void
}

export const useUIStore = create<UIState>((set) => ({
  // Sidebar
  sidebarOpen: true,
  mobileSidebarOpen: false,
  currentPage: 'dashboard',

  // Modals
  activeModal: null,
  modalData: null,

  // Toasts
  toasts: [],

  // Search filters
  searchFilter: 'all',
  statusFilter: 'all',

  // Cross-page focus handoff
  focusTarget: null,

  // Actions
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),

  setCurrentPage: (page) => set({ currentPage: page, mobileSidebarOpen: false }),

  openModal: (modalId, data = null) => set({ activeModal: modalId, modalData: data }),

  closeModal: () => set({ activeModal: null, modalData: null }),

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const newToast = { ...toast, id }

    set((state) => {
      // A keyed toast is one question with one answer, so a repeat of the
      // same key replaces the copy already on screen rather than stacking a
      // second one behind it. Replaced in place, not moved to the end, so
      // the stack does not reorder itself under the desk's cursor while
      // they are reaching for a button.
      const at = toast.key
        ? state.toasts.findIndex((t) => t.key === toast.key)
        : -1

      if (at === -1) return { toasts: [...state.toasts, newToast] }

      const toasts = [...state.toasts]
      toasts[at] = newToast
      return { toasts }
    })

    // Auto-remove after `duration`, defaulting to 5s.
    //
    // `?? 5000`, not `|| 5000`: a caller that passes 0 means "stay until it
    // is dealt with", and every caller that does is a decision the desk has
    // to make — Start Class, Extend, End Class. `||` turned all of those
    // into five-second notices, so the 0 they passed did the opposite of
    // what it says and the button was gone before anyone could press it.
    const duration = toast.duration ?? 5000
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }))
      }, duration)
    }
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  setSearchFilter: (filter) => set({ searchFilter: filter }),

  setStatusFilter: (filter) => set({ statusFilter: filter }),

  setFocusTarget: (target) => set({ focusTarget: target }),

  clearFocusTarget: () => set({ focusTarget: null }),
}))

// ============================================
// Toast Helpers
// ============================================

export const toast = {
  success: (title: string, message?: string, opts?: ToastOptions) => {
    useUIStore.getState().addToast({ type: 'success', title, message, ...opts })
  },
  error: (title: string, message?: string, opts?: ToastOptions) => {
    useUIStore.getState().addToast({ type: 'error', title, message, duration: 8000, ...opts })
  },
  warning: (title: string, message?: string, opts?: ToastOptions) => {
    useUIStore.getState().addToast({ type: 'warning', title, message, ...opts })
  },
  info: (title: string, message?: string, opts?: ToastOptions) => {
    useUIStore.getState().addToast({ type: 'info', title, message, ...opts })
  },
}
