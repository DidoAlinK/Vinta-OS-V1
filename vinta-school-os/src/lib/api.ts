/**
 * Vinta School OS — API Client
 * Axios instance with interceptors for JWT auth and academy scoping
 */

import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { API_BASE_URL, TOKEN_KEY, REFRESH_TOKEN_KEY, ACADEMY_ID_KEY } from './constants'

// ============================================
// Token Storage Helpers
// ============================================
// SECURITY NOTE: Storing JWTs in localStorage is vulnerable to XSS attacks.
// Any script that runs on the page can read these tokens. The ideal solution
// is httpOnly cookies set by the backend, which are inaccessible to JavaScript.
// Until the backend supports httpOnly cookie-based auth, we accept this risk
// and mitigate it with CSP headers and input sanitization elsewhere.
// On logout, all tokens MUST be cleared via tokenStorage.clear().

export const tokenStorage = {
  getAccessToken: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },

  setAccessToken: (token: string): void => {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      // Storage full or unavailable
    }
  },

  getRefreshToken: (): string | null => {
    try {
      return localStorage.getItem(REFRESH_TOKEN_KEY)
    } catch {
      return null
    }
  },

  setRefreshToken: (token: string): void => {
    try {
      localStorage.setItem(REFRESH_TOKEN_KEY, token)
    } catch {
      // Storage full or unavailable
    }
  },

  getAcademyId: (): string | null => {
    try {
      return localStorage.getItem(ACADEMY_ID_KEY)
    } catch {
      return null
    }
  },

  setAcademyId: (id: string): void => {
    try {
      localStorage.setItem(ACADEMY_ID_KEY, id)
    } catch {
      // Storage full or unavailable
    }
  },

  clear: (): void => {
    try {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_TOKEN_KEY)
      localStorage.removeItem(ACADEMY_ID_KEY)
    } catch {
      // Ignore
    }
  },
}

// ============================================
// Create Axios Instance
// ============================================

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ============================================
// Request Interceptor
// ============================================

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Add JWT token
    const token = tokenStorage.getAccessToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // Add Academy ID header when available (backend ignores it if not needed)
    const academyId = tokenStorage.getAcademyId()
    if (academyId) {
      config.headers['X-Academy-Id'] = academyId
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// ============================================
// Response Interceptor
// ============================================

/**
 * Endpoints where a 401 means "the credentials you just typed are wrong",
 * rather than "your session is dead".
 *
 * This list must stay this short. It should only ever contain requests that
 * *are* the act of authenticating — because for those, a 401 is an ordinary,
 * recoverable user error, and tearing the session down would be wrong.
 *
 * Everything else answers 403 when it refuses an action. That includes a wrong
 * step-up PIN: the backend's `verify_staff_pin` decorator, and the inline owner
 * checks in `auth.py` and `settings.py`, all return 403 precisely so that a
 * mistyped PIN cannot be mistaken for an expired session. If you add a
 * PIN-gated endpoint, make it 403 too — returning 401 there would log the user
 * out and discard whatever they were doing.
 */
const CREDENTIAL_CHECK_ENDPOINTS = [
  '/auth/login', // wrong email or password
  '/auth/verify-pin', // wrong profile PIN — the PIN *is* the auth factor here
]

/** 401s that must not tear down the session, beyond the credential checks. */
const SESSION_TOLERANT_401 = [
  ...CREDENTIAL_CHECK_ENDPOINTS,
  '/auth/me', // boot-time token probe; `loadUser` owns the outcome
  '/auth/logout', // the token may already be dead, and the user is leaving
]

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // A 401 anywhere else means the session is genuinely invalid.
    if (error.response?.status === 401) {
      const url = error.config?.url || ''
      const isExpected401 = SESSION_TOLERANT_401.some((endpoint) => url.includes(endpoint))

      if (!isExpected401) {
        const currentPath = window.location.pathname
        if (currentPath !== '/' && currentPath !== '/login') {
          tokenStorage.clear()
          window.location.href = '/'
        }
      }
    }

    return Promise.reject(error)
  }
)

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  data: T
  status: number
  statusText: string
}

export interface ApiError {
  error: string
  message?: string
  status?: number
}

// ============================================
// Helper to extract data from Axios response
// ============================================

export function extractData<T>(response: { data: T }): T {
  return response.data
}

export default api
