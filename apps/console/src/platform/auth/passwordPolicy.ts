/**
 * The password policy, stated once for every surface that sets a password
 * (sign-up, reset, Settings → Security).
 *
 * The SERVER is authoritative: `auth_service.validate_password` enforces the
 * length bounds AND a breached-password blocklist the client cannot check.
 * These constants exist so the rule is visible before submission rather than
 * discovered from a rejected round-trip — keep `PASSWORD_MIN_LENGTH` in step
 * with `settings.password_min_length` (backend `app/config.py`).
 */
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters. Commonly breached passwords are rejected.`;
