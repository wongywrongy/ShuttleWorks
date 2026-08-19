/**
 * Cents → a displayable string. The ONLY money arithmetic in this app.
 *
 * Mirrors `_money` (`api/entries_public.py:410-414`) exactly, including the
 * absence of a currency symbol: there is no currency field in the schema, and
 * inventing one in the renderer would be a lie with a `£` on it.
 *
 * This is a *display* of cents, not a rule about them. Every fee RULE — the
 * per-event price, the bundle schedule, the total — is computed in Python by
 * `compute_fee_total`, on both the quote path and the persist path, so the
 * number shown is the number recorded (R14). `tests/noClientFeeRules.test.ts`
 * is the tripwire that keeps this file the only site of the division.
 *
 * `null` is not `0.00`. A tournament that has configured no price has not
 * declared its entries free, and a zero on a receipt is a claim about money
 * nobody made.
 */
export function formatCents(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2);
}
