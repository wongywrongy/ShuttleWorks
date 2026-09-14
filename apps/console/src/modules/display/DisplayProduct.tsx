import { Navigate } from 'react-router-dom';
import { useTournamentId } from '../../hooks/useTournamentId';

/** Legacy preview entry: link issuance and its ephemeral preview have one owner. */
export function DisplayProduct() {
  const tid = useTournamentId();
  return <Navigate to={`/tournaments/${tid}/display/board`} replace />;
}
