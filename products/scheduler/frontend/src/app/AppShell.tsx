import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '../store/uiStore';
import { useTournamentState } from '../hooks/useTournamentState';
import { useAdvisories } from '../hooks/useAdvisories';
import { useSuggestions } from '../hooks/useSuggestions';
import { SolverHud } from '../components/SolverHud';
import { UnsavedBanner } from '../components/UnsavedBanner';
import { ToastStack } from '../components/Toast';
import { UnlockModalHost } from '../components/common/UnlockModalHost';
import { AppStatusPopover } from '../components/AppStatusPopover';
import { useTournamentId } from '../hooks/useTournamentId';
import { WorkspaceShell } from '../platform/product-shell/WorkspaceShell';
import { ModuleOutlet } from './workspace/ModuleOutlet';
import { useWorkspaceIdentity } from '../platform/domain/useWorkspaceIdentity';
import {
  moduleForTab,
  defaultTabForModule,
  modulesForWorkspace,
  primaryModuleForOpen,
  isModuleEnterable,
} from '../platform/domain/moduleModel';
import type { ModuleId, WorkspaceModule } from '../platform/product-shell/types';
import { useWorkspaceModules } from '../platform/domain/useWorkspaceModules';
import { ModuleUnavailablePanel } from './workspace/ModuleUnavailablePanel';
import { WorkspaceShellSurface } from '../products/workspace/WorkspaceShellSurface';
import { SHELL_SEGMENTS, isAdminSegment } from '../platform/product-shell/workspaceNav';

/** Whether the active module's pane is the normal module outlet or the
 *  unavailable panel. A missing active module (empty/partial list) resolves
 *  to the outlet defensively. In practice no false guard fires during load
 *  for a second reason: the caller passes `modulesForWorkspace(kind)` until
 *  the real catalog arrives, and that fallback always has the workspace's own
 *  operator module enterable (and TournamentPage sets the optimistic kind
 *  synchronously before paint), so the active tab's module is enterable. */
export type ActivePane =
  | { kind: 'outlet' }
  | {
      kind: 'panel';
      label: string;
      note?: string;
      primary: ModuleId;
      primaryLabel: string;
      canOpenSettings: boolean;
    };

export function resolveActivePane(
  activeModule: ModuleId,
  modules: WorkspaceModule[],
): ActivePane {
  const active = modules.find((m) => m.id === activeModule);
  if (!active || isModuleEnterable(active.status)) return { kind: 'outlet' };
  const primary = primaryModuleForOpen(modules);
  const primaryWm = modules.find((m) => m.id === primary);
  return {
    kind: 'panel',
    label: active.label,
    note: active.note,
    primary,
    primaryLabel: primaryWm?.label ?? primary,
    canOpenSettings: active.status === 'disabled',
  };
}

export function AppShell() {
  // Theme + density hooks live at App.tsx level so they fire on every
  // route. ``useTournamentState`` runs for ALL tournament kinds (meet +
  // bracket) via ``<SharedStateHooks />``. The meet-only polling hooks
  // (``useAdvisories`` + ``useSuggestions``) are gated to kind='meet'
  // below via ``<MeetOnlyPollingHooks />`` so a bracket tournament
  // doesn't fire two unrelated GETs on every poll cycle.
  const activeTab = useUiStore((s) => s.activeTab);
  const activeTournamentKind = useUiStore((s) => s.activeTournamentKind);
  const pushToast = useUiStore((s) => s.pushToast);
  const setActiveProposal = useUiStore((s) => s.setActiveProposal);
  const navigate = useNavigate();
  const tid = useTournamentId();
  const identity = useWorkspaceIdentity();
  const activeModule = moduleForTab(activeTab, activeTournamentKind);
  // Real persisted module state (sub-project #2); fall back to the kind-derived
  // catalog while loading or on error.
  const { modules: realModules } = useWorkspaceModules(tid);
  const modules = realModules ?? modulesForWorkspace(activeTournamentKind);
  // Meet-only polling runs when the Meet module is enabled (data exists), not
  // by kind — so a hybrid keeps polling and a bracket-only workspace doesn't.
  // Gate on the REAL catalog, never the kind-derived fallback: on the
  // kind-agnostic Overview `kind` is briefly null and the fallback would
  // default to meet-enabled, firing stray meet polls on a bracket-only
  // workspace. Until the real modules load, meet polling stays off.
  const meetEnabled = (realModules ?? []).some(
    (m) => m.id === 'meet' && m.status === 'enabled',
  );
  // Both engines enabled → the Operations Courts/Live segments render ONE
  // unified cross-engine surface (SP-F4). Gate on the REAL catalog so an
  // indeterminate/loading state fails safe to single-engine.
  const bracketEnabled = (realModules ?? []).some(
    (m) => m.id === 'bracket' && m.status === 'enabled',
  );
  const bothEnginesEnabled = meetEnabled && bracketEnabled;
  // Whether to render the module outlet or the unavailable panel.
  const pane = resolveActivePane(activeModule, modules);

  // Discard any in-flight proposal when the operator switches tabs.
  // Otherwise the next visit to the originating tab re-opens the
  // diff modal with stale data (the schedule may have changed in the
  // meantime; the operator hasn't agreed to commit those exact moves).
  // Server-side TTL eviction will clean up the abandoned proposal.
  useEffect(() => {
    setActiveProposal(null);
    // intentionally trigger only on tab change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Catch anything that would otherwise surface only in the devtools console
  // — unhandled promise rejections and top-level runtime errors — and surface
  // them as sticky error toasts with a dev-friendly detail line.
  useEffect(() => {
    const onRejection = (ev: PromiseRejectionEvent) => {
      const reason = ev.reason;
      // The axios response interceptor on ``apiClient.client`` stamps
      // ``__handled = true`` on every error it surfaces (including the
      // deduped toasts). Re-toasting those here just creates a second
      // pop-up for an already-shown failure. Console-log only.
      if (
        reason &&
        typeof reason === 'object' &&
        (reason as { __handled?: boolean }).__handled
      ) {
        console.error('[unhandledrejection — already toasted]', reason);
        return;
      }
      const msg = reason instanceof Error ? reason.message : String(reason ?? 'Unknown error');
      // Keep the full stack in the console for debugging.
      console.error('[unhandledrejection]', reason);
      pushToast({
        level: 'error',
        message: 'Unhandled error',
        detail: msg,
      });
    };
    const onError = (ev: ErrorEvent) => {
      console.error('[window.error]', ev.error ?? ev.message);
      pushToast({
        level: 'error',
        message: 'Unexpected error',
        detail: ev.message,
      });
    };
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, [pushToast]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      {/* Operator-surface texture — a barely-perceptible noise overlay
          (1.8% alpha) lifts the flat ``--background`` away from looking
          like a default Tailwind tint. Fixed + pointer-events-none keeps
          it off the GPU's continuous-repaint path; the SVG is inlined as
          a data URI so it doesn't add a network request. Hidden from
          reduced-motion users for whom the visual fizz can be
          distracting. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-hud opacity-[0.018] mix-blend-overlay motion-reduce:hidden"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
      {/* Skip-link: hidden until focused. Lets keyboard users jump past the
          WorkspaceShell chrome straight into the active pane. The target
          id (#main) is on the <main> element inside WorkspaceShell below. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-modal focus:rounded-sm focus:bg-primary focus:px-3 focus:py-1.5 focus:text-sm focus:text-primary-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to content
      </a>
      {/* useTournamentState runs for BOTH meet and bracket kinds —
          brackets persist their Setup + Roster + Events config
          through the same ``/tournaments/{id}/state`` endpoint. */}
      <SharedStateHooks />
      {/* Meet-only polling hooks: advisories + suggestions are meet-specific
          and should not fire on bracket-kind tournaments where those
          endpoints have no meaningful data. */}
      {meetEnabled ? <MeetOnlyPollingHooks /> : null}
      <WorkspaceShell
        identity={identity}
        modules={modules}
        tid={tid ?? ''}
        kind={activeTournamentKind}
        activeTab={activeTab}
        adminActive={isAdminSegment(activeTab)}
        onOpenAdmin={() => {
          if (tid) navigate(`/tournaments/${tid}/ws-members`);
        }}
        onBackToHub={() => navigate('/')}
        statusSlot={<AppStatusPopover />}
      >
        <UnsavedBannerSlot />
        <main id="main" className="min-h-0 flex-1 overflow-hidden">
          {SHELL_SEGMENTS.has(activeTab) ? (
            <div className="h-full overflow-auto">
              <WorkspaceShellSurface segment={activeTab} modules={modules} />
            </div>
          ) : pane.kind === 'outlet' ? (
            <ModuleOutlet bothEnginesEnabled={bothEnginesEnabled} />
          ) : (
            <ModuleUnavailablePanel
              label={pane.label}
              note={pane.note}
              primaryLabel={pane.primaryLabel}
              onGoToPrimary={() => {
                if (tid)
                  navigate(`/tournaments/${tid}/${defaultTabForModule(pane.primary)}`, {
                    replace: true,
                  });
              }}
              onOpenSettings={
                pane.canOpenSettings && tid
                  ? // Deep-link to the in-workspace Modules admin — this panel
                    // shows for a disabled module, so that's where it's enabled.
                    () => navigate(`/tournaments/${tid}/ws-modules`)
                  : undefined
              }
            />
          )}
        </main>
      </WorkspaceShell>
      <SolverHud />
      <ToastStack />
      <UnlockModalHost />
    </div>
  );
}

// Shared hooks that run for both meet-kind AND bracket-kind tournaments.
// Hydrates from and persists to the server-side ``/tournaments/{id}/state``
// endpoint so both surfaces round-trip their config through the same path.
function SharedStateHooks() {
  useTournamentState();
  return null;
}

// Meet-only polling hooks. Hosting them in a sibling component lets
// us conditionally mount them based on tournament kind without
// violating React's "hooks must be called in the same order every
// render" rule. The hooks themselves don't render anything; they
// just register polling timers and write into Zustand stores.
function MeetOnlyPollingHooks() {
  // Poll /schedule/advisories every 15s and surface warn/critical
  // advisories as toasts.
  useAdvisories();
  // Poll /schedule/suggestions every 8s and drop into appStore. The
  // SuggestionsRail (rendered per-page directly under each
  // AdvisoryBanner) reads from the store.
  useSuggestions();
  return null;
}

// Banner slot: collapses to zero height when no banner is visible so the
// main flex-fill layout stays exact. UnsavedBanner returns null when idle.
function UnsavedBannerSlot() {
  return (
    <div className="empty:hidden border-b border-border bg-background px-4 py-1.5">
      <UnsavedBanner />
    </div>
  );
}
