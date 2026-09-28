/**
 * Vinta School OS — internationalisation bootstrap
 *
 * Three languages ship: English, French and Arabic. English is the source of
 * truth — every key exists there, and `fallbackLng` points at it, so a key that
 * is missing from fr/ar renders the English sentence rather than a raw key path
 * like `students:page.title` on screen.
 *
 * Resources are imported statically rather than fetched. The whole dictionary
 * set is a few tens of kilobytes, and it means the first paint after a language
 * switch never flashes untranslated text while a chunk downloads.
 *
 * Nothing here touches the DOM. `themeStore.setLanguage` owns `<html lang>` and
 * `<html dir>` because it is also the thing that persists the choice; keeping
 * both halves in one place is what stops the direction attribute and the loaded
 * dictionary from disagreeing.
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { LANGUAGE_KEY } from '../lib/constants'

/* ── English (source) ── */
import enAuth from './locales/en/auth.json'
import enBilling from './locales/en/billing.json'
import enCalendar from './locales/en/calendar.json'
import enClasses from './locales/en/classes.json'
import enCommon from './locales/en/common.json'
import enDashboard from './locales/en/dashboard.json'
import enNav from './locales/en/nav.json'
import enSettings from './locales/en/settings.json'
import enStudents from './locales/en/students.json'
import enTeachers from './locales/en/teachers.json'

/* ── French ── */
import frAuth from './locales/fr/auth.json'
import frBilling from './locales/fr/billing.json'
import frCalendar from './locales/fr/calendar.json'
import frClasses from './locales/fr/classes.json'
import frCommon from './locales/fr/common.json'
import frDashboard from './locales/fr/dashboard.json'
import frNav from './locales/fr/nav.json'
import frSettings from './locales/fr/settings.json'
import frStudents from './locales/fr/students.json'
import frTeachers from './locales/fr/teachers.json'

/* ── Arabic ── */
import arAuth from './locales/ar/auth.json'
import arBilling from './locales/ar/billing.json'
import arCalendar from './locales/ar/calendar.json'
import arClasses from './locales/ar/classes.json'
import arCommon from './locales/ar/common.json'
import arDashboard from './locales/ar/dashboard.json'
import arNav from './locales/ar/nav.json'
import arSettings from './locales/ar/settings.json'
import arStudents from './locales/ar/students.json'
import arTeachers from './locales/ar/teachers.json'

// ============================================
// Languages
// ============================================

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'ar'] as const

export type Language = (typeof SUPPORTED_LANGUAGES)[number]

/**
 * French is the default because the academies this is built for work in
 * French day to day. It is only the *fallback* default — an explicit choice in
 * Settings → Appearance always wins, and is stored per browser.
 */
export const DEFAULT_LANGUAGE: Language = 'fr'

/** Writing direction per language. Arabic is the only RTL one. */
export const DIRECTION: Record<Language, 'ltr' | 'rtl'> = {
  en: 'ltr',
  fr: 'ltr',
  ar: 'rtl',
}

/** Human labels for the language picker, each written in its own script. */
export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  fr: 'Français',
  ar: 'العربية',
}

/**
 * Namespaces, one per feature area. Kept in a list so the shape of the bundle
 * is greppable — a namespace that is not in here will not be loaded.
 */
export const NAMESPACES = [
  'common',
  'nav',
  'auth',
  'dashboard',
  'students',
  'teachers',
  'classes',
  'calendar',
  'billing',
  'settings',
] as const

export type Namespace = (typeof NAMESPACES)[number]

/** Narrows an arbitrary string (a stored value, a server field) to a Language. */
export function isLanguage(value: unknown): value is Language {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  )
}

/** `en-US` style locale tag for `Intl` from our short code. */
export function localeTag(lang: Language): string {
  return lang === 'ar' ? 'ar-DZ' : lang === 'fr' ? 'fr-DZ' : 'en-US'
}

/**
 * The language `readStoredLanguage` reads — the user's explicit choice from a
 * previous visit, or the default. Reads storage directly rather than going
 * through the store so that i18next can be initialised before React mounts.
 */
export function readStoredLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY)
    if (isLanguage(saved)) return saved
  } catch {
    // Storage can throw in private mode or when disabled. Not fatal — fall
    // through to the default rather than blocking the app on a preference.
  }
  return DEFAULT_LANGUAGE
}

// ============================================
// Init
// ============================================

const resources = {
  en: {
    common: enCommon,
    nav: enNav,
    auth: enAuth,
    dashboard: enDashboard,
    students: enStudents,
    teachers: enTeachers,
    classes: enClasses,
    calendar: enCalendar,
    billing: enBilling,
    settings: enSettings,
  },
  fr: {
    common: frCommon,
    nav: frNav,
    auth: frAuth,
    dashboard: frDashboard,
    students: frStudents,
    teachers: frTeachers,
    classes: frClasses,
    calendar: frCalendar,
    billing: frBilling,
    settings: frSettings,
  },
  ar: {
    common: arCommon,
    nav: arNav,
    auth: arAuth,
    dashboard: arDashboard,
    students: arStudents,
    teachers: arTeachers,
    classes: arClasses,
    calendar: arCalendar,
    billing: arBilling,
    settings: arSettings,
  },
} as const

// Read once: the initial `lng` below and the document attributes applied after
// init must agree, and two reads could in principle straddle a storage change.
const initialLanguage = readStoredLanguage()

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LANGUAGES,
  // `en-GB` / `fr-FR` and friends must resolve to their base language rather
  // than 404 into the fallback.
  load: 'languageOnly',
  defaultNS: 'common',
  ns: NAMESPACES,
  interpolation: {
    // React already escapes everything it renders; i18next escaping on top of
    // that turns "L'élève" into "L&#39;élève" in the DOM.
    escapeValue: false,
  },
  returnNull: false,
  // `fallbackLng: 'en'` is what actually keeps a raw `namespace:key` path off
  // the screen: a key missing from fr/ar renders the English sentence. This
  // only warns, in development, for the case English is missing it too — which
  // is a real bug, because English is meant to be the complete source.
  saveMissing: false,
  missingKeyHandler: import.meta.env.DEV
    ? (_lngs, ns, key) => {
        console.warn(`[i18n] missing key: ${ns}:${key}`)
      }
    : undefined,
})

/**
 * Point `<html>` at a language: `lang` for font selection and hyphenation,
 * `dir` for the layout of everything inside it.
 *
 * Exported so the switcher in `themeStore` and the bootstrap below share one
 * definition of which languages are right-to-left. A second copy of that
 * ternary is exactly how an RTL locale ends up shipping as LTR.
 */
export function applyDocumentLanguage(lang: Language): void {
  document.documentElement.setAttribute('lang', lang)
  document.documentElement.setAttribute('dir', DIRECTION[lang])
}

// Applied at import time rather than from a React effect, so the very first
// paint is already directed. This module is evaluated before the app renders;
// an effect ran a frame later, which was long enough for an Arabic user to see
// a left-to-right splash flip once the store caught up.
applyDocumentLanguage(initialLanguage)

export default i18n
