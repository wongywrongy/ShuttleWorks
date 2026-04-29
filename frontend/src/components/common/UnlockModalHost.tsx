/**
 * Single mount point for the global UnlockModal.
 *
 * Renders <UnlockModal /> whenever ``useAppStore.unlockModalState``
 * is non-null. ``useLockGuard.confirmUnlock`` populates that slice with
 * a resolver; this component routes the operator's choice back through
 * the resolver and clears the slice.
 *
 * Mount once at the top of ``AppShell`` so every page benefits.
 */
import { useAppStore } from '../../store/appStore';
import { UnlockModal } from './UnlockModal';

export function UnlockModalHost() {
  const state = useAppStore((s) => s.unlockModalState);
  if (!state || !state.open) return null;
  return (
    <UnlockModal
      actionDescription={state.actionDescription}
      onConfirm={() => state.resolve(true)}
      onCancel={() => state.resolve(false)}
    />
  );
}
