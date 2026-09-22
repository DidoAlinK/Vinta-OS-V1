import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { getInitials } from '../../lib/formatters'
import { AVATAR_PRESETS } from '../../lib/constants'
import type { Profile } from '../../types/auth'
import { Plus, Crown, Shield } from 'lucide-react'
import { PINModal } from './PINModal'

export default function ProfilePicker() {
  const navigate = useNavigate()
  const { user, profiles, profilesLoading, loadProfiles } = useAuthStore()
  const [selectedForPin, setSelectedForPin] = useState<Profile | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  useEffect(() => {
    loadProfiles().catch(() => {
      // Profiles may not exist yet for new accounts — that's ok, we show empty state
    })
  }, [])

  const getAvatarColors = (profile: Profile, index: number): readonly [string, string] => {
    if (profile.avatar_color_1 && profile.avatar_color_2) {
      return [profile.avatar_color_1, profile.avatar_color_2]
    }
    if (profile.picture?.colors) {
      return profile.picture.colors
    }
    return AVATAR_PRESETS[index % AVATAR_PRESETS.length].colors
  }

  const handleSelectProfile = (profile: Profile) => {
    if (profile.has_pin === true) {
      setSelectedForPin(profile)
    } else {
      // No PIN set — go straight to dashboard
      useAuthStore.getState().selectProfile(profile)
      navigate('/app/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      {/* Background orbs */}
      <div className="absolute top-[-200px] left-[-100px] w-[500px] h-[500px] rounded-full opacity-10" style={{ background: 'radial-gradient(circle, var(--gold), transparent)' }} />
      <div className="absolute bottom-[-200px] right-[-100px] w-[400px] h-[400px] rounded-full opacity-10" style={{ background: 'radial-gradient(circle, var(--violet), transparent)' }} />

      {/* Header */}
      <div className="text-center mb-10 animate-fade-in">
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'Space Grotesk', color: 'var(--text)' }}>
          Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!
        </h1>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {profiles.length > 0 ? 'Select your profile to continue' : 'Create your first profile to get started'}
        </p>
      </div>

      {/* Loading */}
      {profilesLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }} />
        </div>
      )}

      {/* Profiles grid */}
      {!profilesLoading && (
        <div className="flex flex-wrap justify-center gap-6 max-w-[640px] w-full animate-fade-in">
          {profiles.map((profile, index) => {
            const colors = getAvatarColors(profile, index)
            const isHovered = hoveredId === profile.id

            return (
              <button
                key={profile.id}
                onClick={() => handleSelectProfile(profile)}
                onMouseEnter={() => setHoveredId(profile.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="group flex flex-col items-center gap-3 p-4 rounded-2xl transition-all duration-300"
                style={{
                  background: isHovered ? 'rgba(255,255,255,.06)' : 'transparent',
                  transform: isHovered ? 'translateY(-8px)' : 'none',
                }}
              >
                {/* Squircle avatar */}
                <div className="relative">
                  <div
                    className="w-[100px] h-[100px] rounded-[28px] flex items-center justify-center text-white text-3xl font-bold transition-all duration-300"
                    style={{
                      background: `linear-gradient(150deg, ${colors[0]}, ${colors[1]})`,
                      boxShadow: isHovered
                        ? `0 16px 40px rgba(0,0,0,.35), 0 1px 0 rgba(255,255,255,.3) inset`
                        : '0 10px 26px rgba(0,0,0,.18), 0 1px 0 rgba(255,255,255,.3) inset',
                      fontFamily: 'Space Grotesk',
                    }}
                  >
                    {getInitials(profile.name)}
                  </div>

                  {/* Role badge */}
                  <div
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{
                      background: profile.role === 'owner' ? 'var(--gold)' : 'var(--emerald)',
                      boxShadow: '0 2px 8px rgba(0,0,0,.25)',
                    }}
                  >
                    {profile.role === 'owner'
                      ? <Crown size={12} color="white" />
                      : <Shield size={12} color="white" />
                    }
                  </div>
                </div>

                {/* Name */}
                <span className="text-[13px] font-medium" style={{ color: 'var(--text)' }}>
                  {profile.name}
                </span>

                {/* Role label */}
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                  style={{
                    color: profile.role === 'owner' ? '#b3872a' : '#0f6b4d',
                    background: profile.role === 'owner' ? 'rgba(179,135,42,.12)' : 'rgba(15,107,77,.12)',
                  }}
                >
                  {profile.role === 'owner' ? 'Owner' : 'Staff'}
                </span>
              </button>
            )
          })}

          {/* Empty state: show when no profiles */}
          {profiles.length === 0 && !profilesLoading && (
            <div className="w-full flex flex-col items-center gap-4 py-8">
              <div
                className="w-[100px] h-[100px] rounded-[28px] flex items-center justify-center"
                style={{
                  background: 'var(--input-bg)',
                  border: '2px dashed var(--glass-border)',
                }}
              >
                <Plus size={36} style={{ color: 'var(--muted)' }} />
              </div>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                No profiles yet
              </p>
              <button
                onClick={() => navigate('/profile/create')}
                className="px-6 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
                style={{ background: 'var(--gold)' }}
              >
                Create your first profile
              </button>
            </div>
          )}

          {/* Add profile tile (only when profiles exist) */}
          {profiles.length > 0 && (
            <button
              onClick={() => navigate('/profile/create')}
              onMouseEnter={() => setHoveredId('add')}
              onMouseLeave={() => setHoveredId(null)}
              className="flex flex-col items-center gap-3 p-4 rounded-2xl transition-all duration-300 border-2 border-dashed"
              style={{
                borderColor: 'var(--glass-border)',
                color: 'var(--muted)',
                transform: hoveredId === 'add' ? 'translateY(-8px)' : 'none',
              }}
            >
              <div className="w-[100px] h-[100px] rounded-[28px] flex items-center justify-center" style={{ background: 'var(--input-bg)' }}>
                <Plus size={32} />
              </div>
              <span className="text-[13px] font-medium">Add Profile</span>
            </button>
          )}
        </div>
      )}

      {/* PIN Modal */}
      {selectedForPin && (
        <PINModal
          profile={selectedForPin}
          onClose={() => setSelectedForPin(null)}
          onVerified={() => {
            useAuthStore.getState().selectProfile(selectedForPin)
            setSelectedForPin(null)
            navigate('/app/dashboard')
          }}
        />
      )}
    </div>
  )
}
