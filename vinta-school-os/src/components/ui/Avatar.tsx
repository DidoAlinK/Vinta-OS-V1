import { forwardRef, useState, type ImgHTMLAttributes, type CSSProperties } from 'react'
import { cn } from '../../lib/cn'

/* ─── Helpers ─── */

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash)
}

/* ─── Preset gradient pairs ─── */

const gradientPairs: [string, string][] = [
  ['#b3872a', '#0f6b4d'], // Gold → Emerald
  ['#7c3aed', '#0ea5e9'], // Violet → Sky
  ['#dc2626', '#ea580c'], // Red → Orange
  ['#0d9488', '#10b981'], // Teal → Emerald
  ['#db2777', '#ec4899'], // Pink → Rose
  ['#6366f1', '#8b5cf6'], // Indigo → Violet
  ['#f59e0b', '#ef4444'], // Amber → Red
  ['#14b8a6', '#06b6d4'], // Teal → Cyan
]

function getGradientForName(name: string, colors?: [string, string]): string {
  const pair = colors ?? gradientPairs[hashCode(name) % gradientPairs.length]
  return `linear-gradient(135deg, ${pair[0]}, ${pair[1]})`
}

/* ─── Size config ─── */

const sizeConfig = {
  xs: { dim: 32, fontSize: 12, radius: 10 },
  sm: { dim: 40, fontSize: 14, radius: 12 },
  md: { dim: 48, fontSize: 16, radius: 14 },
  lg: { dim: 56, fontSize: 20, radius: 17 },
  xl: { dim: 64, fontSize: 22, radius: 19 },
} as const

/* ─── Squircle radius (30% of dimension) ─── */

function squircleRadius(dim: number): number {
  return Math.round(dim * 0.3)
}

/* ─── Props ─── */

export interface AvatarProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'size'> {
  /** Display name — used for initials fallback */
  name: string
  /** Optional explicit gradient pair override */
  colors?: [string, string]
  /** xs (32), sm (40), md (48), lg (56), xl (64) */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}

/* ─── Component ─── */

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ name = '', colors, src, alt, size = 'md', className, style, ...imgProps }, ref) => {
    const [imgError, setImgError] = useState(false)
    const config = sizeConfig[size]
    const showImage = src && !imgError

    const containerStyle: CSSProperties = {
      width: config.dim,
      height: config.dim,
      borderRadius: squircleRadius(config.dim),
      boxShadow: '0 10px 22px rgba(0,0,0,.18)',
      ...style,
    }

    return (
      <div
        ref={ref}
        role="img"
        aria-label={alt || name || 'Avatar'}
        className={cn(
          'relative shrink-0 overflow-hidden',
          'flex items-center justify-center',
          'select-none',
          className,
        )}
        style={containerStyle}
      >
        {showImage ? (
          <img
            src={src}
            alt={alt || name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
            draggable={false}
            {...imgProps}
          />
        ) : (
          <span
            className="text-white font-bold font-[family-name:var(--font-heading)]"
            style={{
              fontSize: config.fontSize,
              background: getGradientForName(name, colors),
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {name ? getInitials(name) : '?'}
          </span>
        )}
      </div>
    )
  },
)

Avatar.displayName = 'Avatar'

export default Avatar
