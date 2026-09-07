/**
 * DownstreamImpact — the per-section blast-radius note (SP-OPCON-1 RDY-4).
 *
 * The wording pattern is fixed ("Saving this updates: X, Y, Z.") and the
 * targets come from ONE map — the server's `downstreamImpact` list on the
 * section DTO (`apps/api/src/workspaces/setup.py::_IMPACT`) — never from
 * per-page prose, so two sections can't describe the same consumer in two
 * vocabularies.
 */
export function DownstreamImpact({ targets, readOnly = false }: { targets: string[]; readOnly?: boolean }) {
  if (readOnly || !targets.length) return null;
  // V3-OC06.1: one plain sentence next to Save, not an uppercase
  // "DOWNSTREAM IMPACT" heading that reads as internal documentation.
  return (
    <div className="border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">
        Saving this updates: {targets.join(', ')}.
      </p>
    </div>
  );
}
