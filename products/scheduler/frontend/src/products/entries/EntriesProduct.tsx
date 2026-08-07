/**
 * Entries product wrapper — the module component `ModuleOutlet` mounts.
 *
 * Thin by design, matching `DisplayProduct`: the outlet needs a component
 * that knows the workspace id, and `EntriesDesk` takes it as a prop so its
 * tests never need a router.
 */
import { useTournamentId } from '../../hooks/useTournamentId';
import { EntriesDesk } from './EntriesDesk';

export function EntriesProduct() {
  const tid = useTournamentId();
  return <EntriesDesk tid={tid} />;
}
