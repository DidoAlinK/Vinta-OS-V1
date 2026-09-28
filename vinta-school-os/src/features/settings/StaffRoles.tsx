import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Avatar } from '../../components/ui/Avatar'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Toggle } from '../../components/ui/Toggle'
import type { StaffMember } from '../../types/settings'
import { UserPlus, Shield, Users } from 'lucide-react'

/* ─── Props ─── */

export interface StaffRolesProps {
  staff: StaffMember[]
  onAdd: () => void
  onDeactivate: (id: string) => void
  onReactivate: (id: string) => void
}

/* ─── Component ─── */

export function StaffRoles({ staff, onAdd, onDeactivate, onReactivate }: StaffRolesProps) {
  const { t } = useTranslation('settings')
  const activeStaff = staff.filter((s) => s.is_active)
  const inactiveStaff = staff.filter((s) => !s.is_active)

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      {/* Header card */}
      <Card>
        <CardHeader
          title={t('staff.title')}
          actions={
            <Button variant="primary" size="sm" onClick={onAdd}>
              <UserPlus className="w-4 h-4" />
              {t('staff.addProfile')}
            </Button>
          }
        />
        <CardBody>
          <p className="text-sm text-[var(--muted)]">
            {t('staff.description')}
          </p>
        </CardBody>
      </Card>

      {/* Active staff */}
      {activeStaff.length > 0 && (
        <Card>
          <CardHeader title={t('staff.active', { count: activeStaff.length })} />
          <CardBody>
            <div className="flex flex-col gap-1">
              {activeStaff.map((member) => (
                <div
                  key={member.id}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3',
                    'rounded-[var(--radius-sm)]',
                    'hover:bg-[var(--glass)] transition-colors',
                  )}
                >
                  <Avatar
                    name={member.name}
                    src={member.picture?.dataUrl}
                    size="md"
                  />

                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-[var(--text)] truncate">
                      {member.name}
                    </span>
                    {member.phone && (
                      <span className="text-xs text-[var(--muted)] truncate">
                        {member.phone}
                      </span>
                    )}
                  </div>

                  {/* Role badge */}
                  <Badge
                    variant={member.role === 'owner' ? 'gold' : 'emerald'}
                    size="sm"
                  >
                    <Shield className="w-3 h-3 me-1" />
                    {member.role === 'owner' ? t('staff.role.owner') : t('staff.role.staff')}
                  </Badge>

                  {/* Deactivate toggle (only for staff, not owner) */}
                  {member.role !== 'owner' && (
                    <Toggle
                      checked={member.is_active}
                      onCheckedChange={() => onDeactivate(member.id)}
                    />
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Inactive staff */}
      {inactiveStaff.length > 0 && (
        <Card>
          <CardHeader title={t('staff.deactivated', { count: inactiveStaff.length })} />
          <CardBody>
            <div className="flex flex-col gap-1">
              {inactiveStaff.map((member) => (
                <div
                  key={member.id}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3',
                    'rounded-[var(--radius-sm)]',
                    'opacity-60',
                  )}
                >
                  <Avatar name={member.name} src={member.picture?.dataUrl} size="md" />

                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-[var(--text)] truncate">
                      {member.name}
                    </span>
                    {member.phone && (
                      <span className="text-xs text-[var(--muted)] truncate">
                        {member.phone}
                      </span>
                    )}
                  </div>

                  <Badge variant="grey" size="sm">
                    {t('staff.deactivatedBadge')}
                  </Badge>

                  <button
                    onClick={() => onReactivate(member.id)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[11px] font-medium',
                      'bg-[var(--emerald-soft)] text-[var(--emerald)]',
                      'hover:opacity-80 transition-opacity',
                    )}
                  >
                    {t('staff.reactivate')}
                  </button>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {staff.length === 0 && (
        <Card>
          <CardBody>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Users className="w-10 h-10 text-[var(--muted)]" />
              <p className="text-sm text-[var(--muted)]">
                {t('staff.empty')}
              </p>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

export default StaffRoles
