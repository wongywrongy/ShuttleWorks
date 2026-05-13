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
  return <DSToastStack toasts={toasts} onDismiss={dismiss} />;
}
