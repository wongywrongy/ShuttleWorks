/**
 * Scheduler's toast wrapper.
 *
 * The rendering primitive lives in `@scheduler/design-system` so
 * tournament can adopt the same look. Scheduler keeps this thin
 * shim that wires the Zustand store's toast slice into the
 * design-system's pure `<ToastStack>`.
 */
import { useUiStore } from '../store/uiStore';
import { ToastStack as DSToastStack } from '@scheduler/design-system';

export function ToastStack() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  const activeTab = useUiStore((s) => s.activeTab);

  // The `tv` tab is the in-shell `/tv` preview (`DisplayProduct`), which
  // embeds the standalone public board inside AppShell's module outlet.
  // AppShell mounts this component as a root-level sibling of every
  // segment, so without this guard operator API-error toasts (and
  // advisory-as-toast — see `hooks/useAdvisories.ts`) would float over
  // the preview even though the standalone `/display` route (outside
  // AppShell entirely) never has a ToastStack mounted at all. Mirrors
  // `SolverHud`'s identical `activeTab === 'tv'` guard for the same
  // "operator chrome must not leak into the public-board mirror" reason.
  // All hooks are called unconditionally above; the early return happens
  // after every hook has run (Rules of Hooks).
  if (activeTab === 'tv') return null;

  return <DSToastStack toasts={toasts} onDismiss={dismiss} />;
}
