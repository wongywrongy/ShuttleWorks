/** Stable copy for the codes the ceremony can meet; anything else shows the
 *  server's own message, which never contains credential material. */
export function mfaFailureMessage(failure: unknown): string {
  const error = failure as { code?: string; message?: string; response?: { data?: { detail?: { retryAfterSeconds?: number } } } };
  switch (error?.code) {
    case 'AUTH_MFA_UNAVAILABLE':
      return 'Authenticator sign-in is unavailable on this server right now. Try again later or contact your administrator.';
    case 'AUTH_THROTTLED': {
      const seconds = error.response?.data?.detail?.retryAfterSeconds;
      return seconds ? `Too many attempts. Try again in ${seconds}s.` : 'Too many attempts. Try again shortly.';
    }
    case 'AUTH_INVALID_CREDENTIALS':
      return 'Your current password is incorrect.';
    case 'AUTH_MFA_INVALID':
      return 'That code was not accepted. Codes change every 30 seconds and work once.';
    default:
      return failure instanceof Error && failure.message ? failure.message : 'Verification failed. Please try again.';
  }
}
