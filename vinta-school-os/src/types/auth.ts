/**
 * Vinta School OS — Auth Types
 */

// ============================================
// User / Profile
// ============================================

export interface User {
  id: string
  academy_id: string
  name: string
  email: string
  phone?: string
  role: 'owner' | 'staff'
  picture?: ProfilePicture | null
  avatar_color_1?: string
  avatar_color_2?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProfilePicture {
  type: 'preset' | 'initials' | 'upload'
  value?: string
  colors?: [string, string]
  dataUrl?: string
}

export interface Profile {
  id: string
  name: string
  role: 'owner' | 'staff'
  has_pin?: boolean
  picture?: ProfilePicture | null
  avatar_color_1?: string
  avatar_color_2?: string
}

// ============================================
// Auth Requests
// ============================================

export interface LoginRequest {
  email: string
  password: string
}

export interface SignupRequest {
  name: string
  email: string
  password: string
}

export interface VerifyPinRequest {
  user_id: string
  pin: string
}

export interface CreateProfileRequest {
  name: string
  role: 'owner' | 'staff'
  pin: string
  phone?: string
  avatar_color_1: string
  avatar_color_2: string
  /** Owner PIN authorizing creation (required by POST /auth/create-profile). */
  owner_pin?: string
}

// ============================================
// Auth Responses
// ============================================

export interface LoginResponse {
  access_token: string
  refresh_token: string
  user_id: string
  name: string
  role: 'owner' | 'staff'
  academy_id: string
}

export interface SignupResponse {
  academy_id: string
  name: string
}

export interface VerifyPinResponse {
  success: boolean
  access_token?: string
  refresh_token?: string
  user?: User
}

export interface ProfileListResponse {
  profiles: Profile[]
}

// ============================================
// Auth State
// ============================================

export interface AuthState {
  user: User | null
  token: string | null
  refreshToken: string | null
  academyId: string | null
  /**
   * Tenant academy display name, sourced from `GET /settings/academy`.
   * `null` until loaded. Never substitute a hardcoded fallback in the UI —
   * an unknown academy name must render as blank, not as someone else's school.
   */
  academyName: string | null
  /** Current academic term label (e.g. "2026 — Fall term"). */
  currentTerm: string | null
  isAuthenticated: boolean
  isLoading: boolean

  // Profiles
  profiles: Profile[]
  selectedProfile: Profile | null
  profilesLoading: boolean

  // Actions
  login: (email: string, password: string) => Promise<void>
  signup: (academyName: string, email: string, password: string, pin: string) => Promise<SignupResponse>
  logout: () => void
  switchProfile: () => void
  loadUser: () => Promise<void>
  loadProfiles: () => Promise<void>
  loadAcademy: () => Promise<void>
  selectProfile: (profile: Profile) => void
  verifyPin: (userId: string, pin: string) => Promise<VerifyPinResponse>
  createProfile: (data: CreateProfileRequest) => Promise<Profile>
  setAcademyId: (id: string) => void
}
