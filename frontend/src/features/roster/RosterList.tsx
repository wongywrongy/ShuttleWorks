import type { PlayerDTO } from '../../api/dto';

interface RosterListProps {
  players: PlayerDTO[];
  onEdit: (player: PlayerDTO) => void;
  onDelete: (playerId: string) => void;
}

export function RosterList({ players, onEdit, onDelete }: RosterListProps) {
  if (players.length === 0) {
    return (
      <div className="p-8 bg-white rounded-lg shadow text-center text-muted-foreground">
        No players in roster. Add players to get started.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-muted/40">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              ID
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Availability Windows
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Min Rest (min)
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Notes
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {players.map((player) => (
            <tr key={player.id}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                {player.name}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                {player.id}
              </td>
              <td className="px-6 py-4 text-sm text-muted-foreground">
                {player.availability.length > 0 ? (
                  <div className="space-y-0.5">
                    {player.availability.map((w, idx) => (
                      <div key={idx} className="text-xs">
                        {w.start} - {w.end}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-green-600 font-medium">Always available</span>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                {player.minRestMinutes !== null && player.minRestMinutes !== undefined ? (
                  player.minRestMinutes
                ) : (
                  <span className="text-muted-foreground italic">Uses default</span>
                )}
              </td>
              <td className="px-6 py-4 text-sm text-muted-foreground">
                {player.notes || '-'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button
                  onClick={() => onEdit(player)}
                  className="text-blue-600 hover:text-blue-900 mr-4"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(player.id)}
                  className="text-red-600 hover:text-red-900"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
