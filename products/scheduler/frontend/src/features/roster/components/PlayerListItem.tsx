import { Menu } from '@headlessui/react';
import { SchoolBadgeEditor } from './SchoolBadgeEditor';
import { RankBadgeEditor } from './RankBadgeEditor';
import type { PlayerDTO, RosterGroupDTO } from '../../../api/dto';

interface PlayerListItemProps {
  player: PlayerDTO;
  schools: RosterGroupDTO[];
  isSelected: boolean;
  onToggleSelect: () => void;
  onSchoolChange: (schoolId: string) => void;
  onRanksChange: (ranks: string[]) => void;
  onRemoveRankFromPlayer?: (playerId: string, rank: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * PlayerListItem Component
 *
 * Individual player row in the table view.
 *
 * Features:
 * - Checkbox for multi-select
 * - Player name (prominent)
 * - Inline school editor (SchoolBadgeEditor)
 * - Inline rank editor (RankBadgeEditor)
 * - Action menu (Edit, Delete)
 * - Table row layout (unified with MatchesList)
 */
export function PlayerListItem({
  player,
  schools,
  isSelected,
  onToggleSelect,
  onSchoolChange,
  onRanksChange,
  onRemoveRankFromPlayer,
  onEdit,
  onDelete,
}: PlayerListItemProps) {
  const currentSchool = schools.find(s => s.id === player.groupId);
  const schoolColor = currentSchool?.metadata?.color;

  return (
    <tr className={`border-t border-border/60 hover:bg-muted/40 ${isSelected ? 'bg-muted' : ''}`}>
      {/* Checkbox Column */}
      <td className="px-2 py-1">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="w-3.5 h-3.5 text-foreground border-border rounded focus:ring-gray-500"
          aria-label={`Select ${player.name}`}
        />
      </td>

      {/* Player Name Column */}
      <td className="px-2 py-1 font-medium text-foreground">{player.name}</td>

      {/* School Column - colored cell background */}
      <td
        className="px-2 py-1 text-muted-foreground"
        style={schoolColor ? { backgroundColor: `${schoolColor}15` } : undefined}
      >
        <SchoolBadgeEditor
          currentSchoolId={player.groupId}
          schools={schools}
          onSchoolChange={onSchoolChange}
        />
      </td>

      {/* Events/Ranks Column */}
      <td className="px-2 py-1 text-muted-foreground">
        <RankBadgeEditor
          currentRanks={player.ranks || []}
          schoolId={player.groupId}
          playerId={player.id}
          onRanksChange={onRanksChange}
          onRemoveRankFromPlayer={onRemoveRankFromPlayer}
        />
      </td>

      {/* Actions Column */}
      <td className="px-2 py-1 text-right">
        <Menu as="div" className="relative inline-block text-left">
          <Menu.Button className="inline-flex items-center justify-center w-6 h-6 text-muted-foreground hover:text-muted-foreground focus:outline-none rounded">
            <span className="sr-only">Open menu</span>
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </Menu.Button>

          <Menu.Items className="absolute right-0 z-popover mt-1 w-32 origin-top-right rounded bg-card shadow-sm ring-1 ring-foreground/5 focus:outline-none">
            <div className="py-0.5">
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={onEdit}
                    className={`${
                      active ? 'bg-muted text-foreground' : 'text-foreground'
                    } group flex w-full items-center px-3 py-1.5 text-xs`}
                  >
                    <svg
                      className="mr-2 h-3.5 w-3.5 text-muted-foreground"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Edit
                  </button>
                )}
              </Menu.Item>

              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={onDelete}
                    className={`${
                      active ? 'bg-red-50 text-red-900' : 'text-red-700'
                    } group flex w-full items-center px-3 py-1.5 text-xs`}
                  >
                    <svg
                      className="mr-2 h-3.5 w-3.5 text-red-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    Delete
                  </button>
                )}
              </Menu.Item>
            </div>
          </Menu.Items>
        </Menu>
      </td>
    </tr>
  );
}
