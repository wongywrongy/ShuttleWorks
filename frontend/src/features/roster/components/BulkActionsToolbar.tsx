import { Menu } from '@headlessui/react';
import type { RosterGroupDTO } from '../../../api/dto';

interface BulkActionsToolbarProps {
  selectedCount: number;
  schools: RosterGroupDTO[];
  onClearSelection: () => void;
  onBulkSchoolAssign: (schoolId: string) => void;
  onBulkRankAssign: () => void;
  onBulkDelete: () => void;
}

/**
 * BulkActionsToolbar Component
 *
 * Sticky bottom toolbar that appears when players are selected.
 *
 * Features:
 * - Shows selection count
 * - Assign School dropdown
 * - Assign Ranks button (opens dialog)
 * - Delete Selected button
 * - Clear Selection button
 * - Slide-up animation
 */
export function BulkActionsToolbar({
  selectedCount,
  schools,
  onClearSelection,
  onBulkSchoolAssign,
  onBulkRankAssign,
  onBulkDelete,
}: BulkActionsToolbarProps) {
  if (selectedCount === 0) {
    return null;
  }

  const handleDelete = () => {
    if (confirm(`Delete ${selectedCount} player${selectedCount !== 1 ? 's' : ''}? This action cannot be undone.`)) {
      onBulkDelete();
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-2 border-blue-500 shadow animate-slide-up">
      <div className="max-w-7xl mx-auto px-3 py-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Selection Count */}
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="font-semibold text-foreground">
              {selectedCount} player{selectedCount !== 1 ? 's' : ''} selected
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 flex-1 justify-end flex-wrap">
            {/* Assign School Dropdown */}
            <Menu as="div" className="relative inline-block text-left">
              <Menu.Button className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
                Assign School
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </Menu.Button>

              <Menu.Items className="absolute bottom-full mb-2 right-0 w-56 origin-bottom-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                <div className="py-1">
                  {schools.length === 0 ? (
                    <div className="px-4 py-2 text-sm text-muted-foreground">
                      No schools available
                    </div>
                  ) : (
                    schools.map((school) => (
                      <Menu.Item key={school.id}>
                        {({ active }) => (
                          <button
                            onClick={() => onBulkSchoolAssign(school.id)}
                            className={`${
                              active ? 'bg-blue-50 text-blue-900' : 'text-foreground'
                            } group flex w-full items-center px-4 py-2 text-sm`}
                          >
                            {school.name}
                          </button>
                        )}
                      </Menu.Item>
                    ))
                  )}
                </div>
              </Menu.Items>
            </Menu>

            {/* Assign Ranks Button */}
            <button
              onClick={onBulkRankAssign}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
              Assign Ranks
            </button>

            {/* Delete Button */}
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <svg
                className="w-4 h-4"
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

            {/* Clear Selection */}
            <button
              onClick={onClearSelection}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-muted text-foreground text-sm font-medium rounded-sm hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Clear Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
