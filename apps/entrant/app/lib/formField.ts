/**
 * The hidden input's name, in a module the browser bundle may reach.
 *
 * **Why it is not in `formCsrf.server.ts` with the rest of the constants.**
 * The form component renders `<input name={FORM_FIELD}>`, and the component
 * ships to the client; `formCsrf.server.ts` imports `node:crypto` and carries
 * the `.server` suffix, so React Router's build refuses the import outright
 * ("Server-only module referenced by client") rather than quietly bundling a
 * derivation into the browser. That refusal is correct and worth keeping, so
 * the one constant the client legitimately needs — a field NAME, which is
 * neither a secret nor a derivation — lives here on its own, and
 * `formCsrf.server.ts` re-exports it so there is still exactly one
 * declaration.
 *
 * Held byte-identical to `app/form_csrf.FORM_FIELD` by
 * `tests/backend/unit/test_form_csrf_cross_tier.py`, which reads
 * THIS file. That pin is load-bearing precisely because the rendered form
 * reads the constant instead of repeating the literal: change it here and the
 * input's name changes with it, instead of the two drifting while the test
 * stays green.
 */
export const FORM_FIELD = '_csrf';
