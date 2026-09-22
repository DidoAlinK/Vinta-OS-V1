/**
 * Vinta School OS — Student classes card
 *
 * One chip per group the student is actually enrolled in.
 *
 * The detail route ships `enrollments`; the list route only ships the
 * comma-joined `classes` string, which is used as a fallback for the moment
 * before the detail payload lands. Neither present means the student genuinely
 * has no group, which reads as one calm muted sentence.
 */

import { BookOpen } from 'lucide-react'
import type { Enrollment } from '../../../types/student'
import { EmptyLine, ProfileCard } from './ProfileCard'

export interface StudentClassesProps {
  enrollments: Enrollment[]
  /** Comma-joined class names from the list route, used only as a fallback. */
  classes: string
}

export function StudentClasses({ enrollments, classes }: StudentClassesProps) {
  const listed = Array.isArray(enrollments) ? enrollments : []

  const names: string[] =
    listed.length > 0
      ? listed.map((e) => e.class_name).filter((name) => Boolean(name))
      : (typeof classes === 'string' ? classes : '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)

  return (
    <ProfileCard title="Classes" icon={<BookOpen size={13} />}>
      {names.length === 0 ? (
        <EmptyLine>Not enrolled in any group yet.</EmptyLine>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {names.map((name, i) => (
            <span
              key={`${name}-${i}`}
              title={name}
              className="px-2.5 py-1 text-xs font-medium max-w-full truncate"
              style={{
                background: 'var(--input-bg)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-xs)',
                color: 'var(--text)',
              }}
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </ProfileCard>
  )
}

export default StudentClasses
