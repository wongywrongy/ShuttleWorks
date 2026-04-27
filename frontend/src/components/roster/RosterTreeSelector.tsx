import { useState } from 'react';
import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { RosterGroupDTO } from '../../api/dto';

interface RosterTreeSelectorProps {
  groups: RosterGroupDTO[];
  selectedId?: string | null;
  onSelect: (groupId: string | null) => void;
  allowNone?: boolean;
  filterType?: 'group' | 'roster' | 'both';
  searchPlaceholder?: string;
}

export function RosterTreeSelector({
  groups,
  selectedId,
  onSelect,
  allowNone = true,
  filterType = 'both',
  searchPlaceholder = 'Search groups...',
}: RosterTreeSelectorProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  // Build tree structure
  const buildTree = (parentId: string | null = null): RosterGroupDTO[] => {
    return groups
      .filter(g => g.parentId === parentId)
      .filter(g => {
        if (filterType === 'group') return g.type === 'group';
        if (filterType === 'roster') return g.type === 'roster';
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const rootGroups = buildTree(null);

  // Filter groups by search term
  const filterGroups = (groupList: RosterGroupDTO[]): RosterGroupDTO[] => {
    if (!searchTerm) return groupList;

    const matches = (g: RosterGroupDTO): boolean => {
      const nameMatch = g.name.toLowerCase().includes(searchTerm.toLowerCase());
      const childrenMatch = buildTree(g.id).some(child => matches(child));
      return nameMatch || childrenMatch;
    };

    return groupList.filter(matches);
  };

  const filteredRootGroups = filterGroups(rootGroups);

  const toggleExpand = (groupId: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpanded(newExpanded);
  };

  const renderGroup = (group: RosterGroupDTO, level: number = 0): React.ReactElement => {
    const children = buildTree(group.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(group.id);
    const isSelected = selectedId === group.id;
    const indent = level * 20;

    return (
      <div key={group.id}>
        <div
          className={`flex items-center py-1 px-2 rounded cursor-pointer hover:bg-muted ${
            isSelected ? 'bg-blue-100 border border-blue-300' : ''
          }`}
          style={{ paddingLeft: `${indent + 8}px` }}
          onClick={() => onSelect(group.id)}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(group.id);
              }}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
              aria-expanded={isExpanded}
              className="mr-2 w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? (
                <ChevronDown aria-hidden="true" className="h-3 w-3" />
              ) : (
                <ChevronRight aria-hidden="true" className="h-3 w-3" />
              )}
            </button>
          )}
          {!hasChildren && <span className="mr-2 w-4" />}
          <span className={`text-sm flex items-center gap-2 ${group.type === 'group' ? 'font-semibold' : ''}`}>
            <span className={`w-2 h-2 rounded-full ${group.type === 'group' ? 'bg-muted-foreground/60' : 'bg-blue-400'}`} />
            {group.name}
          </span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {children.map(child => renderGroup(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="border border-border rounded-md bg-card max-h-96 overflow-y-auto">
      {searchPlaceholder && (
        <div className="p-2 border-b border-border">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full px-3 py-1 border border-border rounded text-sm"
          />
        </div>
      )}
      <div className="p-2">
        {allowNone && (
          <div
            className={`py-1 px-2 rounded cursor-pointer hover:bg-muted ${
              selectedId === null ? 'bg-blue-100 border border-blue-300' : ''
            }`}
            onClick={() => onSelect(null)}
          >
            <span className="text-sm text-muted-foreground">(None / Root Level)</span>
          </div>
        )}
        {filteredRootGroups.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            {searchTerm ? 'No groups found' : 'No groups available'}
          </div>
        ) : (
          filteredRootGroups.map(group => renderGroup(group))
        )}
      </div>
    </div>
  );
}
