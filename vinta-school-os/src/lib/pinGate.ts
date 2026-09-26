/**
 * Vinta School OS — Step-up PIN gate
 *
 * One place that answers "is it really you?" before something is destroyed.
 *
 * Deleting a course group, a room, a teacher, a subject or a session used to
 * happen on the first click. The app already had the right shape for this in
 * exactly one spot — `VoidModal`, which verifies a PIN and *then* arms the
 * destructive confirm — and this pulls that shape out so every destructive call
 * site can share it instead of each inventing its own.
 *
 * Whose PIN: the signed-in profile's own. `VoidModal` deliberately asks for the
 * OWNER's PIN because voiding a live class restores credits, which is an owner
 * decision. An ordinary delete is not: the person pressing the button proves it
 * is them, and a staff profile can therefore delete what staff are allowed to
 * delete. Asking for the owner's PIN here would have made half the desk's work
 * impossible without the owner standing there.
 *
 * Safe by construction: `/auth/verify-pin` is in `CREDENTIAL_CHECK_ENDPOINTS`
 * in `lib/api.ts`, so the 401 a wrong PIN produces does NOT clear the session
 * and bounce the user to the login screen. That list must not be trimmed.
 */

import api from './api'
import { useAuthStore } from '../stores/authStore'

/** The server's own sentence when it has one, else this. */
export const PIN_GATE_FALLBACK = 'Could not verify the PIN. Press Retry.'

/**
 * A PIN that was not accepted (or could not be checked).
 *
 * Distinct from a generic Error so a caller can tell "the user mistyped" from
 * "the request never landed" without parsing a string.
 */
export class PinError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PinError'
  }
}

/**
 * Verify the signed-in profile's PIN as a step-up.
 *
 * Resolves when the PIN is accepted; throws `PinError` with something worth
 * showing when it is not.
 *
 * Verified against `selectedProfile` first, falling back to `user`: the profile
 * chosen at the picker is who is sitting at the desk, and its PIN is the one
 * they were just asked for to get in. `user` is the login account, which is the
 * owner's — a different person on a shared academy login.
 *
 * The tokens the endpoint returns on success are deliberately NOT stored. This
 * is a confirmation, not a sign-in: swapping the live session's token for a
 * fresh one mid-screen would be a session change nobody asked for. `VoidModal`
 * calls the same endpoint directly for the same reason.
 */
export async function verifyStaffPin(pin: string): Promise<void> {
  const { selectedProfile, user } = useAuthStore.getState()
  const profileId = selectedProfile?.id ?? user?.id

  if (!profileId) {
    throw new PinError('No profile is signed in — reload and sign in again.')
  }

  try {
    await api.post('/auth/verify-pin', { user_id: profileId, pin: pin.trim() })
  } catch (err) {
    const res = (err as { response?: { status?: number; data?: { error?: string } } })
      ?.response

    // The endpoint lists itself as a credential check, so a rejected PIN is a
    // 401 here rather than a 403. Both are "try again", not "your session died".
    if (res?.status === 401 || res?.status === 403) {
      throw new PinError('Incorrect PIN.')
    }

    // Everything else — rate limiting included — carries the server's own
    // sentence, which is more useful than anything invented here.
    const server = res?.data?.error
    throw new PinError(
      typeof server === 'string' && server ? server : PIN_GATE_FALLBACK,
    )
  }
}
