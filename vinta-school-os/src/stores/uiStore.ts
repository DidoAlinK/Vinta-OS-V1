/**
 * Vinta School OS — UI Store
 * Sidebar state, modals, toasts, and global UI state
 */

import { create } from 'zustand'

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
}

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

  // Search
  searchQuery: string
  searchFilter: string
  statusFilter: string

  // Actions
  setSidebarOpen: (open: boolean) => void
  setMobileSidebarOpen: (open: boolean) => void
  setCurrentPage: (page: string) => void
  openModal: (modalId: string, data?: unknown) => void
  closeModal: () => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  setSearchQuery: (query: string) => void
  setSearchFilter: (filter: string) => void
  setStatusFilter: (filter: string) => void
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

  // Search
  searchQuery: '',
  searchFilter: 'all',
  statusFilter: 'all',

  // Actions
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),

  setCurrentPage: (page) => set({ currentPage: page, mobileSidebarOpen: false }),

  openModal: (modalId, data = null) => set({ activeModal: modalId, modalData: data }),

  closeModal: () => set({ activeModal: null, modalData: null }),

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const newToast = { ...toast, id }

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }))

    // Auto-remove after duration (default 5s)
    const duration = toast.duration || 5000
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

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSearchFilter: (filter) => set({ searchFilter: filter }),

  setStatusFilter: (filter) => set({ statusFilter: filter }),
}))

// ============================================
// Toast Helpers
// ============================================

export const toast = {
  success: (title: string, message?: string, opts?: { duration?: number; actions?: ToastAction[] }) => {
    useUIStore.getState().addToast({ type: 'success', title, message, ...opts })
  },
  error: (title: string, message?: string, opts?: { duration?: number; actions?: ToastAction[] }) => {
    useUIStore.getState().addToast({ type: 'error', title, message, duration: 8000, ...opts })
  },
  warning: (title: string, message?: string, opts?: { duration?: number; actions?: ToastAction[] }) => {
    useUIStore.getState().addToast({ type: 'warning', title, message, ...opts })
  },
  info: (title: string, message?: string, opts?: { duration?: number; actions?: ToastAction[] }) => {
    useUIStore.getState().addToast({ type: 'info', title, message, ...opts })
  },
}
