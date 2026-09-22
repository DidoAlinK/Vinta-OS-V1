/**
 * Vinta School OS — Auth Store
 * JWT authentication, user state, profile management
 */

import { create } from 'zustand'
import api, { tokenStorage } from '../lib/api'
import type {
  User,
  Profile,
  AuthState,
  SignupResponse,
  VerifyPinResponse,
  CreateProfileRequest,
} from '../types/auth'

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  academyId: null,
  academyName: null,
  currentTerm: null,
  isAuthenticated: false,
  isLoading: true,

  profiles: [],
  selectedProfile: null,
  profilesLoading: false,

  // ============================================
  // Login
  // ============================================
  login: async (email: string, password: string) => {
    try {
      const response = await api.post('/auth/login', { email, password })
      const data = response.data

      // Store tokens
      tokenStorage.setAccessToken(data.access_token)
      tokenStorage.setRefreshToken(data.refresh_token)
      tokenStorage.setAcademyId(data.academy_id)

      // Store user info from flat response
      set({
        user: {
          id: data.user_id,
          name: data.name,
          email,
          role: data.role,
          academy_id: data.academy_id,
          phone: '',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        token: data.access_token,
        refreshToken: data.refresh_token,
        academyId: data.academy_id,
        isAuthenticated: true,
      })

      await get().loadAcademy()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      throw new Error(err.response?.data?.error || 'Login failed')
    }
  },

  // ============================================
  // Signup (3-step chain: signup → create-owner → login)
  // ============================================
  signup: async (academyName: string, email: string, password: string, pin: string) => {
    try {
      // Step 1: Create academy (POST /auth/signup)
      const signupRes = await api.post('/auth/signup', {
        name: academyName,
        email,
        password,
      })
      if (signupRes.status !== 201) {
        throw new Error(signupRes.data?.error || 'Signup failed')
      }
      const { academy_id, name } = signupRes.data

      // Step 2: Create owner profile with PIN (POST /auth/create-owner)
      await api.post('/auth/create-owner', {
        academy_id,
        name,
        email,
        password,
        pin,
      }, {
        headers: { 'X-Academy-Id': academy_id },
      })

      // Step 3: Auto-login (POST /auth/login)
      const loginRes = await api.post('/auth/login', { email, password })
      const loginData = loginRes.data

      // Store tokens
      tokenStorage.setAccessToken(loginData.access_token)
      tokenStorage.setRefreshToken(loginData.refresh_token)
      tokenStorage.setAcademyId(loginData.academy_id)

      set({
        user: {
          id: loginData.user_id,
          name: loginData.name,
          email,
          role: loginData.role,
          academy_id: loginData.academy_id,
          phone: '',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        token: loginData.access_token,
        refreshToken: loginData.refresh_token,
        academyId: loginData.academy_id,
        isAuthenticated: true,
      })

      await get().loadAcademy()

      return { academy_id, name }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      throw new Error(err.response?.data?.error || 'Signup failed')
    }
  },

  // ============================================
  // Load Profiles
  // ============================================
  loadProfiles: async () => {
    set({ profilesLoading: true })
    try {
      const response = await api.get('/auth/profiles')
      const data = response.data
      const rawProfiles: Profile[] = data.profiles || data
      // Backend doesn't return has_pin — all profiles have PINs in this system
      const profiles = rawProfiles.map(p => ({ ...p, has_pin: true }))
      set({ profiles, profilesLoading: false })
    } catch (error: unknown) {
      set({ profilesLoading: false })
      const err = error as { response?: { data?: { error?: string } } }
      throw new Error(err.response?.data?.error || 'Failed to load profiles')
    }
  },

  // ============================================
  // Select Profile (local state only)
  // ============================================
  selectProfile: (profile: Profile) => {
    set({ selectedProfile: profile })
  },

  // ============================================
  // Verify PIN
  // ============================================
  verifyPin: async (userId: string, pin: string): Promise<VerifyPinResponse> => {
    try {
      const response = await api.post('/auth/verify-pin', {
        user_id: userId,
        pin,
      })
      const data = response.data

      // If tokens returned, store them
      if (data.access_token) {
        tokenStorage.setAccessToken(data.access_token)
        tokenStorage.setRefreshToken(data.refresh_token)

        set({
          token: data.access_token,
          refreshToken: data.refresh_token,
          user: data.user || get().user,
          isAuthenticated: true,
        })
      }

      return { success: true, ...data }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      throw new Error(err.response?.data?.error || 'Invalid PIN')
    }
  },

  // ============================================
  // Create Profile (requires owner PIN)
  // ============================================
  createProfile: async (data: CreateProfileRequest & { owner_pin?: string }): Promise<Profile> => {
    try {
      const response = await api.post('/auth/create-profile', {
        name: data.name,
        role: data.role,
        pin: data.pin,
        phone: data.phone,
        avatar_color_1: data.avatar_color_1,
        avatar_color_2: data.avatar_color_2,
        owner_pin: data.owner_pin,
      })
      const profile: Profile = response.data
      return profile
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      throw new Error(err.response?.data?.error || 'Failed to create profile')
    }
  },

  // ============================================
  // Logout
  // ============================================
  logout: () => {
    tokenStorage.clear()
    set({
      user: null,
      token: null,
      refreshToken: null,
      academyId: null,
      academyName: null,
      currentTerm: null,
      isAuthenticated: false,
      profiles: [],
      selectedProfile: null,
    })
  },

  // ============================================
  // Switch Profile (go back to profile picker without full logout)
  // ============================================
  switchProfile: () => {
    set({ selectedProfile: null })
  },

  // ============================================
  // Load User (restore from token)
  // ============================================
  loadUser: async () => {
    const token = tokenStorage.getAccessToken()
    const academyId = tokenStorage.getAcademyId()

    if (!token || !academyId) {
      set({ isLoading: false })
      return
    }

    try {
      const response = await api.get('/auth/me')
      const raw = response.data
      const user: User = {
        id: raw.id,
        academy_id: raw.academy_id,
        name: raw.name,
        email: raw.email,
        phone: raw.phone,
        role: raw.role,
        picture: raw.picture ?? null,
        avatar_color_1: raw.avatar_color_1,
        avatar_color_2: raw.avatar_color_2,
        is_active: raw.is_active ?? true,
        created_at: raw.created_at ?? new Date().toISOString(),
        updated_at: raw.updated_at ?? new Date().toISOString(),
      }

      set({
        user,
        token,
        academyId,
        isAuthenticated: true,
        isLoading: false,
      })

      // Fire-and-forget: the academy name is non-critical, and a failure here
      // must never disturb an already-established session.
      void get().loadAcademy()
    } catch {
      tokenStorage.clear()
      set({
        user: null,
        token: null,
        academyId: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  },

  // ============================================
  // Load Academy (tenant display name)
  // ============================================
  loadAcademy: async () => {
    try {
      const response = await api.get('/settings/academy')
      set({
        academyName: response.data?.name ?? null,
        currentTerm: response.data?.current_term ?? null,
      })
    } catch {
      // Non-fatal. The UI shows an empty academy slot rather than guessing.
      set({ academyName: null, currentTerm: null })
    }
  },

  // ============================================
  // Set Academy ID
  // ============================================
  setAcademyId: (id: string) => {
    tokenStorage.setAcademyId(id)
    set({ academyId: id })
  },
}))
