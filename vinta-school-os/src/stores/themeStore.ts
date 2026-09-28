/**
 * Vinta School OS — Theme Store
 * Dark/light mode and font size management with localStorage persistence
 */

import { create } from 'zustand'
import { THEME_KEY, FONT_SIZE_KEY, LANGUAGE_KEY } from '../lib/constants'
import i18n, { applyDocumentLanguage, readStoredLanguage, type Language } from '../i18n'

type Theme = 'light' | 'dark'
type FontSize = 'small' | 'normal' | 'large'

interface ThemeState {
  theme: Theme
  fontSize: FontSize
  language: Language
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
  setFontSize: (size: FontSize) => void
  setLanguage: (lang: Language) => void
  initTheme: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'light',
  fontSize: 'normal',
  language: 'fr',

  toggleTheme: () => {
    const newTheme = get().theme === 'light' ? 'dark' : 'light'
    set({ theme: newTheme })
    applyTheme(newTheme)
    saveTheme(newTheme)
  },

  setTheme: (theme: Theme) => {
    set({ theme })
    applyTheme(theme)
    saveTheme(theme)
  },

  setFontSize: (size: FontSize) => {
    set({ fontSize: size })
    applyFontSize(size)
    saveFontSize(size)
  },

  setLanguage: (lang: Language) => {
    set({ language: lang })
    applyLanguage(lang)
    saveLanguage(lang)
    /* The dictionary and the <html> attributes have to move together.
       Swapping one without the other is exactly how you end up with an Arabic
       interface laid out left-to-right, or an English one full of Arabic. */
    void i18n.changeLanguage(lang)
  },

  initTheme: () => {
    const savedTheme = loadTheme()
    set({ theme: savedTheme })
    applyTheme(savedTheme)

    const savedFontSize = loadFontSize()
    set({ fontSize: savedFontSize })
    applyFontSize(savedFontSize)

    const savedLanguage = loadLanguage()
    set({ language: savedLanguage })
    applyLanguage(savedLanguage)
    void i18n.changeLanguage(savedLanguage)
  },
}))

// ============================================
// Helpers
// ============================================

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)

  // Also apply to body for gradient backgrounds
  if (theme === 'dark') {
    document.body.classList.add('dark')
    document.body.classList.remove('light')
  } else {
    document.body.classList.add('light')
    document.body.classList.remove('dark')
  }
}

function applyFontSize(size: FontSize) {
  const root = document.documentElement
  switch (size) {
    case 'small':
      root.style.fontSize = '13px'
      break
    case 'large':
      root.style.fontSize = '17px'
      break
    default:
      root.style.fontSize = '15px'
  }
}

function applyLanguage(lang: Language) {
  // Delegated, so the right-to-left rule lives in the i18n module rather than
  // being restated here — see `applyDocumentLanguage`.
  applyDocumentLanguage(lang)
}

function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Ignore
  }
}

function saveFontSize(size: FontSize) {
  try {
    localStorage.setItem(FONT_SIZE_KEY, size)
  } catch {
    // Ignore
  }
}

function saveLanguage(lang: Language) {
  try {
    localStorage.setItem(LANGUAGE_KEY, lang)
  } catch {
    // Ignore
  }
}

function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') {
      return saved
    }

    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
  } catch {
    // Ignore
  }
  return 'light'
}

function loadFontSize(): FontSize {
  try {
    const saved = localStorage.getItem(FONT_SIZE_KEY)
    if (saved === 'small' || saved === 'normal' || saved === 'large') {
      return saved
    }
  } catch {
    // Ignore
  }
  return 'normal'
}

/**
 * Restoring is delegated to the i18n bootstrap rather than re-read here.
 *
 * i18next has to pick its language before React mounts, so `readStoredLanguage`
 * necessarily runs first. Reading storage a second time in this file would be a
 * second source of truth for the same fact, and the two could disagree the day
 * one of them learns a new language before the other does.
 */
function loadLanguage(): Language {
  return readStoredLanguage()
}
