import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Toggle } from '../../components/ui/Toggle'
import { Sun, Moon, Type, Globe } from 'lucide-react'
import { useThemeStore } from '../../stores/themeStore'
import type { AcademySettings } from '../../types/settings'

/* ─── Props ─── */

export interface AppearanceProps {
  settings: AcademySettings
  onUpdate: (data: Partial<AcademySettings>) => void
}

/* ─── Option chip ─── */

function OptionChip({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-4 py-2 text-sm font-medium rounded-[var(--radius-xs)]',
        'border transition-all duration-200',
        selected
          ? 'bg-[var(--gold-soft)] border-[var(--gold)] text-[var(--gold)]'
          : 'bg-[var(--input-bg)] border-[var(--glass-border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--glass-strong)]',
      )}
    >
      {label}
    </button>
  )
}

/* ─── Component ─── */

export function Appearance({ settings, onUpdate }: AppearanceProps) {
  const { t } = useTranslation('settings')
  const { theme, setTheme, fontSize: storeFontSize, setFontSize, language: storeLanguage, setLanguage } = useThemeStore()
  const isDark = theme === 'dark'
  const fontSize = settings.default_font_size || storeFontSize || 'normal'
  const language = settings.default_language || storeLanguage || 'fr'

  const handleThemeToggle = (checked: boolean) => {
    const newTheme = checked ? 'dark' : 'light'
    setTheme(newTheme)
    onUpdate({ default_theme: newTheme })
  }

  const handleFontSize = (size: 'small' | 'normal' | 'large') => {
    setFontSize(size)
    onUpdate({ default_font_size: size })
  }

  const handleLanguage = (lang: 'fr' | 'ar' | 'en') => {
    setLanguage(lang)
    onUpdate({ default_language: lang })
  }

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      {/* Theme */}
      <Card>
        <CardHeader
          title={t('appearance.theme.title')}
          actions={
            <div className="flex items-center gap-2">
              <Sun className={cn('w-4 h-4', !isDark && 'text-[var(--gold)]')} />
              <Toggle
                checked={isDark}
                onCheckedChange={handleThemeToggle}
              />
              <Moon className={cn('w-4 h-4', isDark && 'text-[var(--gold)]')} />
            </div>
          }
        />
        <CardBody>
          <p className="text-sm text-[var(--muted)]">
            {isDark ? t('appearance.theme.darkActive') : t('appearance.theme.lightActive')}
          </p>
        </CardBody>
      </Card>

      {/* Font Size */}
      <Card>
        <CardHeader title={t('appearance.fontSize.title')} />
        <CardBody>
          <p className="text-sm text-[var(--muted)] mb-3">
            {t('appearance.fontSize.hint')}
          </p>
          <div className="flex gap-2">
            <OptionChip
              label={t('appearance.fontSize.small')}
              selected={fontSize === 'small'}
              onClick={() => handleFontSize('small')}
            />
            <OptionChip
              label={t('appearance.fontSize.normal')}
              selected={fontSize === 'normal'}
              onClick={() => handleFontSize('normal')}
            />
            <OptionChip
              label={t('appearance.fontSize.large')}
              selected={fontSize === 'large'}
              onClick={() => handleFontSize('large')}
            />
          </div>
        </CardBody>
      </Card>

      {/* Language */}
      <Card>
        <CardHeader
          title={t('appearance.language.title')}
          actions={<Globe className="w-4 h-4 text-[var(--muted)]" />}
        />
        <CardBody>
          <p className="text-sm text-[var(--muted)] mb-3">
            {t('appearance.language.hint')}
          </p>
          {/* The three chips keep their own script on purpose: Français,
              English and العربية are all written in the language they select,
              so someone who cannot read the current interface language can
              still find their own. Do not translate these labels. */}
          <div className="flex gap-2">
            <OptionChip
              label="Français"
              selected={language === 'fr'}
              onClick={() => handleLanguage('fr')}
            />
            <OptionChip
              label="English"
              selected={language === 'en'}
              onClick={() => handleLanguage('en')}
            />
            <OptionChip
              label="العربية"
              selected={language === 'ar'}
              onClick={() => handleLanguage('ar')}
            />
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

export default Appearance
