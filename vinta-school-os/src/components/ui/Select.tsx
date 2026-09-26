/**
 * Vinta School OS — Themed Select
 *
 * Replaces the native `<select>` across the app. A bare `<select>` renders the
 * operating system's own dropdown — grey, boxy, square-cornered, and a
 * different shape in every browser — which is the one piece of OS chrome the
 * rest of this interface has no answer to. Everything else here is glass,
 * gold and squircle.
 *
 * The menu is portalled to `document.body` and positioned `fixed` from the
 * trigger's own rect, following the subject picker in AddTeacherModal. That is
 * not decoration: a Select is nearly always rendered *inside* a modal, and the
 * Modal panel is `overflow-hidden` while its body scrolls, so an absolutely
 * positioned menu would be clipped mid-list. A portal sidesteps every ancestor
 * overflow and stacking context at once.
 *
 * z-[90] is deliberate — above every modal in the app (z-50 … z-[80]) and above
 * the themed DayPicker (z-[81]), below the toast stack (z-[100] and z-[9999]),
 * so a toast is never buried under an open menu.
 *
 * Keyboard: focus stays on the trigger and ArrowUp/ArrowDown move a highlight
 * through the list, so the menu never has to fight the modal for focus.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '../../lib/cn'

/* ─── Types ─── */

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectAction {
  label: string
  icon?: ReactNode
  onClick: () => void
}

export interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  /** Shown on the trigger while nothing is selected. */
  placeholder?: string
  disabled?: boolean
  /** Rendered above the trigger, matching Input. */
  label?: string
  error?: string
  helperText?: string
  size?: 'sm' | 'md' | 'lg'
  /** Icon rendered on the left of the trigger. */
  leftIcon?: ReactNode
  /**
   * Overrides the trigger's own padding/radius. Callers that already had a
   * shared `inputCls` can pass it here and keep their exact geometry.
   */
  className?: string
  id?: string
  name?: string
  /**
   * A call-to-action pinned below the options behind a divider — used by the
   * session flows to offer "New class…" without a list entry that would not be
   * a real value.
   */
  action?: SelectAction
  /** Replaces the placeholder row when the list (or the search) is empty. */
  emptyText?: string
  /** Adds a search field. Defaults to on at 8+ options. */
  searchable?: boolean
  searchPlaceholder?: string
  /** Floor for the menu width, so a narrow trigger still gets a legible menu. */
  menuMinWidth?: number
  'aria-label'?: string
}

/* ─── Component ─── */

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      value,
      onChange,
      options,
      placeholder = 'Select…',
      disabled = false,
      label,
      error,
      helperText,
      size = 'md',
      leftIcon,
      className,
      id,
      name,
      action,
      emptyText = 'Nothing to choose from',
      searchable,
      searchPlaceholder = 'Search…',
      menuMinWidth = 180,
      'aria-label': ariaLabel,
    },
    ref,
  ) => {
    const autoId = useId()
    const selectId = id ?? autoId
    const listId = `${selectId}-list`
    const errorId = `${selectId}-error`
    const helperId = `${selectId}-helper`

    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [activeIndex, setActiveIndex] = useState(-1)
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

    const triggerRef = useRef<HTMLButtonElement | null>(null)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const searchRef = useRef<HTMLInputElement | null>(null)
    const listRef = useRef<HTMLDivElement | null>(null)

    /** 8 is where a list stops being scannable at a glance. */
    const showSearch = searchable ?? options.length >= 8
    /** Primitive, so it is safe to depend on — `action` is a fresh object each render. */
    const hasAction = !!action

    const selected = useMemo(
      () => options.find((o) => o.value === value) ?? null,
      [options, value],
    )

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase()
      if (!q) return options
      return options.filter((o) => o.label.toLowerCase().includes(q))
    }, [options, query])

    /* ── Placement ── */
    // Measured from the trigger and flipped above it when the menu would run
    // off the bottom — a Select in the last field of a tall modal would
    // otherwise open downward into nothing.
    const reposition = useCallback(() => {
      const el = triggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const width = Math.max(rect.width, menuMinWidth)
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))

      // The search field and the action row sit outside the scrolling list, so
      // a height estimate built from the rows alone is short by up to ~82px —
      // enough to decide "fits below" for a menu whose bottom, action row and
      // all, then lands past the viewport edge where nothing can scroll to it.
      const rowEstimate = 40
      const listHeight = Math.min(filtered.length * rowEstimate + 12, 224)
      const menuHeight = listHeight + (showSearch ? 41 : 0) + (hasAction ? 41 : 0)
      const below = rect.bottom + 4
      const flip = below + menuHeight > window.innerHeight && rect.top - menuHeight - 4 > 8

      setPos({
        top: flip ? rect.top - menuHeight - 4 : below,
        left,
        width,
      })
    }, [filtered.length, menuMinWidth, showSearch, hasAction])

    const close = useCallback(() => {
      setOpen(false)
      setQuery('')
      setActiveIndex(-1)
    }, [])

    const openMenu = useCallback(() => {
      if (disabled) return
      setOpen(true)
      // Land the highlight on the current value, or the first row.
      const idx = options.findIndex((o) => o.value === value && !o.disabled)
      const first = options.findIndex((o) => !o.disabled)
      setActiveIndex(idx >= 0 ? idx : first)
      requestAnimationFrame(() => reposition())
    }, [disabled, options, value, reposition])

    /* ── Reposition while open ── */
    // Also re-runs when `filtered.length` changes, so narrowing the list with
    // the search box re-measures: a menu that flipped above the trigger for 30
    // rows has no business staying flipped for 2.
    useEffect(() => {
      if (!open) return
      const onMove = () => reposition()
      reposition()
      window.addEventListener('scroll', onMove, true)
      window.addEventListener('resize', onMove)
      return () => {
        window.removeEventListener('scroll', onMove, true)
        window.removeEventListener('resize', onMove)
      }
    }, [open, reposition])

    /* ── Outside click / Escape ── */
    useEffect(() => {
      if (!open) return
      const onDown = (e: MouseEvent) => {
        const target = e.target as Node
        if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
        close()
      }
      document.addEventListener('mousedown', onDown)
      return () => document.removeEventListener('mousedown', onDown)
    }, [open, close])

    /* ── Keep the search box focused ── */
    useEffect(() => {
      if (open && showSearch) requestAnimationFrame(() => searchRef.current?.focus())
    }, [open, showSearch])

    /* ── Reset the highlight when the list itself changes ── */
    useEffect(() => {
      if (!open) return
      setActiveIndex((i) => {
        // Typing moves the highlight onto the first surviving match. Without
        // this it would stay on whatever index it held, and Enter would pick a
        // row the admin never looked at.
        if (query.trim()) return filtered.findIndex((o) => !o.disabled)
        return filtered[i] && !filtered[i].disabled
          ? i
          : filtered.findIndex((o) => !o.disabled)
      })
    }, [open, filtered, query])

    /* ── Move the highlight and keep it in view ── */
    useEffect(() => {
      if (!open || activeIndex < 0) return
      const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      node?.scrollIntoView({ block: 'nearest' })
    }, [open, activeIndex])

    const commit = useCallback(
      (option: SelectOption) => {
        if (option.disabled) return
        onChange(option.value)
        close()
        requestAnimationFrame(() => triggerRef.current?.focus())
      },
      [onChange, close],
    )

    const step = useCallback(
      (delta: 1 | -1) => {
        setActiveIndex((i) => {
          const n = filtered.length
          if (n === 0) return -1
          let next = i
          for (let hops = 0; hops < n; hops++) {
            next = (next + delta + n) % n
            if (!filtered[next].disabled) return next
          }
          return i
        })
      },
      [filtered],
    )

    const onKeyDown = useCallback(
      (e: ReactKeyboardEvent) => {
        if (!open) {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
            e.preventDefault()
            openMenu()
          }
          return
        }
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault()
            step(1)
            break
          case 'ArrowUp':
            e.preventDefault()
            step(-1)
            break
          case 'Home':
            e.preventDefault()
            setActiveIndex(filtered.findIndex((o) => !o.disabled))
            break
          case 'End': {
            e.preventDefault()
            for (let i = filtered.length - 1; i >= 0; i--) {
              if (!filtered[i].disabled) {
                setActiveIndex(i)
                break
              }
            }
            break
          }
          case 'Enter': {
            e.preventDefault()
            const opt = filtered[activeIndex]
            if (opt) commit(opt)
            break
          }
          case 'Escape':
            e.preventDefault()
            // Stop the modal behind this menu from treating Escape as "close me".
            e.stopPropagation()
            close()
            break
          case 'Tab':
            close()
            break
        }
      },
      [open, openMenu, step, filtered, activeIndex, commit, close],
    )

    const sizeStyles = {
      sm: 'h-9 px-3 text-sm rounded-[var(--radius-xs)]',
      md: 'h-11 px-4 text-sm rounded-[var(--radius-sm)]',
      lg: 'h-13 px-5 text-base rounded-[var(--radius-md)]',
    } as const

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {/* Label */}
        {label && (
          <label
            htmlFor={selectId}
            className="text-sm font-medium text-[var(--text)] font-[family-name:var(--font-heading)]"
          >
            {label}
          </label>
        )}

        {/* Trigger */}
        <button
          ref={(node) => {
            triggerRef.current = node
            if (typeof ref === 'function') ref(node)
            else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node
          }}
          type="button"
          id={selectId}
          name={name}
          onClick={() => (open ? close() : openMenu())}
          onKeyDown={onKeyDown}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-label={ariaLabel}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={cn(
            /* base — mirrors Input's field treatment */
            'w-full flex items-center gap-2 text-left',
            'font-[family-name:var(--font-body)]',
            'bg-[var(--input-bg)] backdrop-blur-sm',
            'border border-[var(--glass-border)]',
            'transition-all duration-200 ease-out',
            'outline-none',
            'hover:border-[var(--gold)]/40',
            'focus:ring-2 focus:ring-[var(--gold-soft)] focus:border-[var(--gold)]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            /* size */
            sizeStyles[size],
            /* caller overrides */
            className,
            /* open / error */
            open && 'ring-2 ring-[var(--gold-soft)] border-[var(--gold)]',
            error && 'border-[var(--red)] focus:ring-[var(--red-soft)] focus:border-[var(--red)]',
          )}
        >
          {leftIcon && <span className="shrink-0 text-[var(--muted)]">{leftIcon}</span>}
          {/*
            An empty value reads muted whether it is the placeholder or an
            explicit "— No room —" row: both mean "not set", and the screens
            that used a native select said so with their own muted class.
          */}
          <span
            className={cn(
              'flex-1 truncate',
              !selected || selected.value === '' ? 'text-[var(--muted)]' : 'text-[var(--text)]',
            )}
          >
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown
            size={15}
            className={cn(
              'shrink-0 text-[var(--muted)] transition-transform duration-200',
              open && 'rotate-180 text-[var(--gold)]',
            )}
          />
        </button>

        {/* Menu */}
        {open &&
          createPortal(
            <div
              ref={menuRef}
              className={cn(
                'fixed z-[90] rounded-2xl overflow-hidden',
                'bg-[var(--card-bg)] border border-[var(--glass-border)]',
                'shadow-2xl animate-fade-in',
              )}
              style={{ top: pos.top, left: pos.left, width: pos.width }}
              onKeyDown={onKeyDown}
            >
              {showSearch && (
                <div className="relative border-b border-[var(--glass-border)]">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
                  />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className={cn(
                      'w-full pl-9 pr-3 py-2.5 text-sm text-[var(--text)]',
                      'bg-transparent outline-none',
                      'placeholder:text-[var(--muted)]',
                    )}
                  />
                </div>
              )}

              <div
                ref={listRef}
                id={listId}
                role="listbox"
                aria-label={ariaLabel ?? label}
                className="max-h-56 overflow-y-auto py-1"
              >
                {filtered.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-[var(--muted)]">
                    {emptyText}
                  </p>
                ) : (
                  filtered.map((option, i) => {
                    const isSelected = option.value === value
                    const isActive = i === activeIndex
                    return (
                      <button
                        key={option.value}
                        type="button"
                        data-index={i}
                        role="option"
                        aria-selected={isSelected}
                        disabled={option.disabled}
                        // onMouseDown rather than onClick, matching the subject
                        // picker: it keeps focus on the trigger and stops the
                        // native focus shift from racing the close.
                        onMouseDown={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          commit(option)
                        }}
                        onMouseEnter={() => !option.disabled && setActiveIndex(i)}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left',
                          'transition-colors duration-75',
                          'disabled:opacity-40 disabled:cursor-not-allowed',
                          isSelected
                            ? 'bg-[var(--gold-soft)] text-[var(--text)] font-semibold'
                            : isActive
                              ? 'bg-[var(--glass)] text-[var(--text)]'
                              : 'text-[var(--text)]',
                        )}
                      >
                        <span className="flex-1 truncate">{option.label}</span>
                        {isSelected && (
                          <Check size={14} className="shrink-0 text-[var(--gold)]" />
                        )}
                      </button>
                    )
                  })
                )}
              </div>

              {/* Call to action — "New class…" in the session flows */}
              {action && (
                <div className="border-t border-[var(--glass-border)]">
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      close()
                      action.onClick()
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-left',
                      'text-[var(--gold)] hover:bg-[var(--gold-soft)]',
                      'transition-colors duration-75',
                    )}
                  >
                    {action.icon}
                    <span className="truncate">{action.label}</span>
                  </button>
                </div>
              )}
            </div>,
            document.body,
          )}

        {/* Error */}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-[var(--red)] font-medium">
            {error}
          </p>
        )}

        {/* Helper */}
        {helperText && !error && (
          <p id={helperId} className="text-xs text-[var(--muted)]">
            {helperText}
          </p>
        )}
      </div>
    )
  },
)

Select.displayName = 'Select'

export default Select
