/**
 * The workspace Overview's phase seam (SP-UI-1).
 *
 * The Overview is a PHASE-KEYED PANEL SYSTEM: what it shows is a function of
 * where the event is in its lifecycle. The phase itself is NOT derived here —
 * `signals.phase` is computed server-side from real play state
 * (`backend/api/workspace_signals.py::_derive_phase`), which is the same value
 * the Hub row action and the shell badge already key on. Deriving it a second
 * time on the client is exactly how those three surfaces would drift apart.
 *
 * This module only does the two things the client legitimately owns:
 *   1. NARROW an untrusted string to the known vocabulary, with a safe default;
 *   2. decide which phases are WORTH SHOWING for a given workspace.
 *
 * The planned Entries capability adds phases to the LEFT of `setup`. When it
 * lands, its phase names join `KNOWN_PHASES`, `visiblePhases` learns the
 * module test that gates them, and the panel map gains entries — no redesign.
 */
import type { TournamentSummaryDTO } from '../../api/dto';
import type { WorkspacePhase } from './lifecycle';

/** The lifecycle vocabulary, in order. Mirrors the backend's `_derive_phase`. */
export const KNOWN_PHASES: readonly WorkspacePhase[] = [
  'setup',
  'ready',
  'live',
  'complete',
] as const;

function isKnownPhase(value: unknown): value is WorkspacePhase {
  return typeof value === 'string' && (KNOWN_PHASES as readonly string[]).includes(value);
}

/**
 * The workspace's current phase, narrowed to the known vocabulary.
 *
 * Absent (older payloads, or `signals` missing entirely) OR unrecognised (a
 * newer backend emitting a phase this build has never heard of) both resolve
 * to `setup`. An unknown phase must render a safe default panel, never crash —
 * that is the seam future phases arrive through.
 */
export function resolvePhase(summary: TournamentSummaryDTO | null): WorkspacePhase {
  const raw = summary?.signals?.phase;
  return isKnownPhase(raw) ? raw : 'setup';
}

/**
 * The phases to render in the stepper — only those that exist for this
 * workspace's enabled modules. No placeholder slots, nothing dashed, no
 * "future" greyed-out phases: a phase appears only once it is real.
 *
 * Today both engines traverse the full four, so the gate is simply "does this
 * workspace have an engine module at all". A workspace with no engine enabled
 * has no lifecycle to show yet — it is still deciding what it is — so the
 * stepper is empty and the Overview leads with the setup checklist instead.
 */
export function visiblePhases(summary: TournamentSummaryDTO | null): WorkspacePhase[] {
  if (!summary) return [];
  const hasEngine = (summary.modules ?? []).some(
    (m) => (m.moduleId === 'meet' || m.moduleId === 'bracket') && m.status === 'enabled',
  );
  // Fall back to the workspace kind for payloads with no module catalog:
  // every workspace has a kind, and a kind implies its engine.
  if (!hasEngine && (summary.modules ?? []).length > 0) return [];
  return [...KNOWN_PHASES];
}

/** Index of `phase` within `phases`; -1 when absent. Drives the stepper's
 *  done/current/upcoming split without each caller re-deriving order. */
export function phaseIndex(phases: readonly WorkspacePhase[], phase: WorkspacePhase): number {
  return phases.indexOf(phase);
}

/** Operator-facing phase labels. Nouns for states, per the voice rules. */
export const PHASE_LABEL: Record<WorkspacePhase, string> = {
  setup: 'Setup',
  ready: 'Ready',
  live: 'Live',
  complete: 'Complete',
};
