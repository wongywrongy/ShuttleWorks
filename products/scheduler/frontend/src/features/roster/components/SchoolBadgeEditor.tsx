import { Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import type { RosterGroupDTO } from '../../../api/dto';

interface SchoolBadgeEditorProps {
  currentSchoolId: string | null;
  schools: RosterGroupDTO[];
  onSchoolChange: (schoolId: string) => void;
  className?: string;
}

/**
 * SchoolBadgeEditor Component
 *
 * Inline dropdown editor for school assignment.
 * Click the school badge to open a dropdown and select a different school.
 *
 * Features:
 * - Accessible dropdown using Headless UI Menu
 * - Shows current school as a badge
 * - Instant update on selection
 * - Keyboard navigation support
 */
export function SchoolBadgeEditor({
  currentSchoolId,
  schools,
  onSchoolChange,
  className = '',
}: SchoolBadgeEditorProps) {
  const currentSchool = schools.find(s => s.id === currentSchoolId);
  const displayText = currentSchool?.name || 'No School';

  return (
    <Menu as="div" className={`relative inline-block ${className}`}>
      <Menu.Button
        className="text-xs text-foreground hover:text-foreground focus:outline-none cursor-pointer"
      >
        {displayText}
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute left-0 z-popover mt-1 w-40 origin-top-left rounded bg-card shadow-sm ring-1 ring-foreground/5 focus:outline-none">
          <div className="py-0.5">
            {schools.length === 0 ? (
              <div className="px-3 py-1.5 text-xs text-muted-foreground">
                No schools available
              </div>
            ) : (
              schools.map((school) => {
                const isSelected = school.id === currentSchoolId;
                const color = school.metadata?.color;
                return (
                  <Menu.Item key={school.id}>
                    {({ active }) => (
                      <button
                        onClick={() => onSchoolChange(school.id)}
                        className={`${
                          active ? 'bg-muted' : ''
                        } group flex w-full items-center justify-between px-3 py-1.5 text-xs text-foreground`}
                      >
                        <span className="flex items-center gap-1.5">
                          {color && (
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: color }}
                            />
                          )}
                          {school.name}
                        </span>
                        {isSelected && (
                          <svg
                            className="h-3 w-3 text-muted-foreground"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </button>
                    )}
                  </Menu.Item>
                );
              })
            )}
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
