import { describe, expect, it, vi } from 'vitest';
import { FRESH_PROOF_CANCELLED, isFreshProofCancelled, withFreshProof } from '../sessionRestore';

const stale = () => Object.assign(new Error('Verify again'), { code: 'AUTH_REAUTH_REQUIRED' });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('resumable fresh proof', () => {
  it('retries once after the lock is cleared by a successful verification', async () => {
    const run = vi.fn().mockRejectedValueOnce(stale()).mockResolvedValue('exported');
    const pending = withFreshProof(run);
    await flush();
    expect(run).toHaveBeenCalledOnce();
    window.dispatchEvent(new CustomEvent('sw:session-restored'));
    await expect(pending).resolves.toBe('exported');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it.each(['sw:reauth-cancelled', 'sw:session-expired'])('gives up quietly on %s and never retries', async (event) => {
    const run = vi.fn().mockRejectedValue(stale());
    const pending = withFreshProof(run);
    await flush();
    window.dispatchEvent(new CustomEvent(event));
    const failure = await pending.catch((error) => error);
    expect(isFreshProofCancelled(failure)).toBe(true);
    expect(failure).toMatchObject({ code: FRESH_PROOF_CANCELLED, __handled: true });
    expect(run).toHaveBeenCalledOnce();
    // Later restores no longer resume the abandoned request.
    window.dispatchEvent(new CustomEvent('sw:session-restored'));
    await flush();
    expect(run).toHaveBeenCalledOnce();
  });

  it('passes every other failure straight through', async () => {
    const run = vi.fn().mockRejectedValue(Object.assign(new Error('gone'), { code: 'TOURNAMENT_NOT_FOUND' }));
    await expect(withFreshProof(run)).rejects.toMatchObject({ code: 'TOURNAMENT_NOT_FOUND' });
    expect(run).toHaveBeenCalledOnce();
  });

  it('does not loop when the retried request is still stale', async () => {
    const run = vi.fn().mockRejectedValue(stale());
    const pending = withFreshProof(run);
    await flush();
    window.dispatchEvent(new CustomEvent('sw:session-restored'));
    await expect(pending).rejects.toMatchObject({ code: 'AUTH_REAUTH_REQUIRED' });
    expect(run).toHaveBeenCalledTimes(2);
  });
});
