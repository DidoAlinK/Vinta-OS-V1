# Translation conventions — Vinta School OS

Read this before translating anything. The i18n layer is already built; this
document is the contract every translator works to so that ten agents editing
ten feature folders produce one coherent app.

## Stack

`i18next` + `react-i18next`, configured in `src/i18n/index.ts`. Resources are
imported statically, so every key you add is in the bundle immediately and
switching language is instant.

## Languages

`en`, `fr`, `ar`. English is the **source of truth** and the fallback: every key
must exist in `en`. If a key is missing from `fr` or `ar` the app renders the
English sentence rather than a broken key path — but that is a bug to fix, not a
strategy. Translate everything.

Arabic is the only RTL language. `<html dir>` is set by the theme store, never by
feature code.

## Namespaces

One namespace per feature area. Each agent owns its namespace and no other.

| Namespace   | Owns these source folders                                        |
| ----------- | ---------------------------------------------------------------- |
| `common`    | `src/components/ui/**`, generic shared wording                   |
| `nav`       | `src/components/layout/**`, the app shell                        |
| `auth`      | `src/features/auth/**`                                           |
| `dashboard` | `src/features/dashboard/**`                                      |
| `students`  | `src/features/students/**`                                       |
| `teachers`  | `src/features/teachers/**`                                       |
| `classes`   | `src/features/classes/**`                                        |
| `calendar`  | `src/features/calendar/**`                                       |
| `billing`   | `src/features/billing/**`                                        |
| `settings`  | `src/features/settings/**`                                       |

Dictionary files live at `src/i18n/locales/<lang>/<namespace>.json`. All three
language files for your namespace are yours to write.

**Only edit files inside your own feature folder and your own three dictionary
files.** Never edit `src/i18n/index.ts`, another feature's folder, another
namespace's dictionary, `src/lib/constants.ts`, or `src/stores/*`.

## Key naming

Nested groups, camelCase leaves, semantic names — never the English sentence.

```json
{
  "page": { "title": "Students", "subtitle": "Manage student records" },
  "table": { "column": { "student": "Student", "renewal": "Renewal" } },
  "empty": { "title": "No students found" }
}
```

Use the **source component or UI region** as the group name (`page`, `table`,
`drawer`, `modal`, `form`, `empty`, `toast`), not the meaning of the string. Two
components that happen to want the same word get their own keys — sharing a key
across components couples them and the first divergent edit breaks the other.

Reuse from `common` where a generic word already exists (`common:action.cancel`,
`common:action.save`, `common:state.loading`). Do not duplicate those into your
namespace.

## Using it in a component

```tsx
import { useTranslation } from 'react-i18next'

function StudentTable() {
  const { t } = useTranslation('students')
  return <h1>{t('page.title')}</h1>
}
```

- Call `useTranslation('<your-namespace>')` once per component, at the top.
- Keys are namespace-relative: `t('page.title')`, not `t('students:page.title')`.
  (Cross-namespace lookups use the colon form — prefer `common` explicitly:
  `t('common:action.save')`.)
- **Never call `t()` at module scope.** A module-level `const LABELS = { a: t('x') }`
  evaluates once, at import, in whatever language happened to be active — it will
  not re-render on a language switch. Move the lookup inside the component, or
  keep the module-level map holding *key names* and call `t(map[k])` in the body.
- Components wrapped in `memo()` are fine — `useTranslation` subscribes them.

### Interpolation and plurals

```tsx
t('roster.showing', { shown: 40, total: 437 })
```

```json
"showing": "Showing {{shown}} of {{total}}"
```

For counts, use i18next plural suffixes. English and French take `_one` /
`_other`; **Arabic takes all six CLDR forms** — `_zero`, `_one`, `_two`, `_few`,
`_many`, `_other`. Supply each form you can justify; i18next falls back down the
chain, so at minimum give `_zero`, `_one`, `_two`, `_few`, `_many`, `_other` for
Arabic to avoid wrong grammar on small counts.

```json
{ "sessions_one": "{{count}} session", "sessions_other": "{{count}} sessions" }
```

Arabic likewise varies by count for the same noun — do not copy the English
one/other split into Arabic.

## RTL: physical → logical utilities

Arabic flips the layout via `dir="rtl"`, but Tailwind's **physical** utilities do
not flip with it. `left-3` is still `left` in Arabic, so a search icon lands on
top of the placeholder text. When you touch a file, convert the physical
utilities you meet into their logical equivalents:

| Physical         | Logical          |
| ---------------- | ---------------- |
| `pl-*` / `pr-*`  | `ps-*` / `pe-*`  |
| `ml-*` / `mr-*`  | `ms-*` / `me-*`  |
| `left-*`         | `start-*`        |
| `right-*`        | `end-*`          |
| `text-left`      | `text-start`     |
| `text-right`     | `text-end`       |
| `border-l-*`     | `border-s-*`     |
| `border-r-*`     | `border-e-*`     |
| `rounded-l-*`    | `rounded-s-*`    |
| `rounded-r-*`    | `rounded-e-*`    |

Also watch for:

- `space-x-*` — does not flip correctly in RTL. Prefer `gap-*` on a flex
  container, which is direction-agnostic.
- Directional icons — a chevron that means "go forward" must point the other way
  in Arabic. `ChevronRight` → use `rtl:rotate-180` or `rtl:-scale-x-100`, or pick
  the icon from the current direction.
- `translate-x-*` on slide-in drawers and toasts — must mirror. Use the `rtl:`
  variant.
- Numerals: keep Western Arabic numerals (`0-9`) — they are what these academies
  use. Do not convert to Eastern Arabic numerals.

Convert only what you are already editing. This is not a licence to restyle
components you are not translating.

## Do not translate

- The currency code `DA` (Algerian dinar) — `3,300 DA` stays `3,300 DA`.
- Brand and product names: `Vinta`, `Vinta School OS`.
- API enum values that also render (`paid`, `due`, `no_plan`, `PRESENT`,
  `CREDIT_BASED`, …) — map them to a display label through your namespace
  instead of printing the raw value, and translate the *label*, not the value.
  Where a status label map already exists in the source, convert it to keys.
- User data: names, phone numbers, class names, notes.
- `console.*` messages, comments, and code identifiers.

## Dates, numbers, currency

Do not call `toLocaleDateString('en-US', …)` directly. Date formatting lives in
`src/lib/formatters.ts` and is being made locale-aware from `i18n.language` —
use those helpers rather than adding new ad-hoc formatting. Money already
formats as `fr-DZ` and stays that way in all three languages.

## Tone

- **French**: standard metropolitan French, formal register. "Enregistrer",
  "Supprimer", "Élève". Use « guillemets » only if the source uses quotes.
- **Arabic**: Modern Standard Arabic, formal. This is school administration
  software — use the established educational vocabulary (تلميذ / أستاذ / قسم /
  حصة / اشتراك). Keep it consistent across the whole app; the same concept must
  use the same Arabic word in every namespace.

Keep French and Arabic strings about the same length as the English. The layouts
are dense grids and a translation twice as long will overflow the table headers.

## Finishing

You are done when no user-facing English string literal remains in the files you
own, and every key you introduced exists in all three of your dictionary files
with real content — no placeholder English left in `fr`/`ar`.
