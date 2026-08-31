/**
 * DownstreamImpact — the per-section blast-radius note (SP-OPCON-1 RDY-4).
 *
 * The wording pattern is fixed ("Saving this updates: X, Y, Z.") and the
 * targets come from ONE map — the server's `downstreamImpact` list on the
 * section DTO (`apps/api/src/workspaces/setup.py::_IMPACT`) — never from
 * per-page prose, so two sections can't describe the same consumer in two
 * vocabularies.
 */
export function DownstreamImpact({ targets }: { targets: string[] }) {
  if (!targets.length) return null;
  return (
    <div className="border-t border-border pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Downstream impact
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Saving this updates: {targets.join(', ')}.
      </p>
    </div>
  );
}
