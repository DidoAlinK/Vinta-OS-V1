/**
 * Vinta School OS — Student guardians card
 *
 * One row per guardian record, with a direct `tel:` action and a red Emergency
 * marker for the one flagged as the emergency contact.
 *
 * Falls back to the student's `parent_phone` **only when there is no guardian
 * record at all**. That fallback is a derived row over real recorded data (the
 * number is on the student's own record), labelled as such — not an invented
 * guardian. With neither present, the card says so in one muted sentence.
 */

import { useTranslation } from 'react-i18next'
import { Phone, User, Users } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { formatPhone } from '../../../lib/formatters'
import type { Guardian } from '../../../types/student'
import { EmptyLine, ProfileCard } from './ProfileCard'

export interface StudentGuardiansProps {
  guardians: Guardian[]
  parentPhone?: string | null
}

interface GuardianRow {
  key: string
  name: string
  relationship: string | null
  phone: string
  isEmergency: boolean
}

/**
 * `formatPhone('')` returns a bare `+213`, which would invent a country code
 * for a guardian whose number is blank on the record. Null means "no number".
 */
function safePhone(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  return trimmed ? formatPhone(trimmed) : null
}

export function StudentGuardians({ guardians, parentPhone }: StudentGuardiansProps) {
  const { t } = useTranslation('students')
  const listed = Array.isArray(guardians) ? guardians : []

  const rows: GuardianRow[] = listed
    .filter((g) => Boolean(g))
    .map((g) => ({
      key: g.id,
      name: g.name,
      relationship: g.relationship?.trim() ? g.relationship : null,
      phone: g.phone,
      isEmergency: Boolean(g.is_emergency),
    }))

  if (rows.length === 0) {
    const fallback = safePhone(parentPhone)
    if (fallback) {
      rows.push({
        key: 'parent-phone',
        // A role, not a person's name — so it is translated like any label.
        name: t('guardians.parentFallback'),
        relationship: null,
        phone: fallback,
        isEmergency: false,
      })
    }
  }

  return (
    <ProfileCard title={t('guardians.title')} icon={<Users size={13} />}>
      {rows.length === 0 ? (
        <EmptyLine>{t('guardians.empty')}</EmptyLine>
      ) : (
        <ul className="space-y-2 list-none m-0 p-0">
          {rows.map((row) => {
            const phone = safePhone(row.phone)
            return (
              <li
                key={row.key}
                className="flex items-center gap-3 px-3 py-2.5"
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'var(--glass)' }}
                  aria-hidden="true"
                >
                  <User size={14} style={{ color: 'var(--muted)' }} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: 'var(--text)' }}
                      title={row.name}
                    >
                      {row.name}
                    </p>
                    {row.isEmergency ? (
                      <span
                        className={cn(
                          'inline-flex items-center px-1.5 py-0.5 rounded-full shrink-0',
                          'text-[10px] font-semibold',
                          'bg-red-soft',
                          'text-red',
                        )}
                        title={t('guardians.emergencyContact')}
                      >
                        {t('guardians.emergency')}
                      </span>
                    ) : null}
                  </div>

                  {/* Relationship and number only — an absent number leaves the
                      relationship alone rather than printing a dash beside it. */}
                  <p
                    className="text-xs truncate"
                    style={{ color: 'var(--muted)' }}
                    title={[row.relationship, phone].filter(Boolean).join(' · ')}
                  >
                    {[row.relationship, phone].filter(Boolean).join(' · ')}
                  </p>
                </div>

                {phone ? (
                  <a
                    href={`tel:${phone}`}
                    aria-label={t('guardians.call', { name: row.name })}
                    title={t('guardians.call', { name: row.name })}
                    className="p-1.5 rounded-lg shrink-0 transition-colors duration-150 hover:bg-[var(--glass)]"
                    style={{ color: 'var(--emerald)' }}
                  >
                    <Phone size={13} aria-hidden="true" />
                  </a>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </ProfileCard>
  )
}

export default StudentGuardians
