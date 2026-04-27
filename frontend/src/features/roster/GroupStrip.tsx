/**
 * Horizontal strip of school chips with an inline "add school" input.
 * Replaces the SchoolFormDialog — creating and renaming happens without
 * ever opening a modal.
 */
import { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import type { RosterGroupDTO } from '../../api/dto';
import { v4 as uuid } from 'uuid';

export function GroupStrip() {
  const groups = useAppStore((s) => s.groups);
  const addGroup = useAppStore((s) => s.addGroup);
  const updateGroup = useAppStore((s) => s.updateGroup);
  const deleteGroup = useAppStore((s) => s.deleteGroup);
  const players = useAppStore((s) => s.players);

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const commitCreate = () => {
    const name = draft.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    const group: RosterGroupDTO = { id: uuid(), name };
    addGroup(group);
    setDraft('');
    setCreating(false);
  };

  const commitRename = (id: string) => {
    const name = editDraft.trim();
    if (!name) {
      setEditing(null);
      return;
    }
    updateGroup(id, { name });
    setEditing(null);
  };

  const handleDelete = (g: RosterGroupDTO) => {
    try {
      deleteGroup(g.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
      window.setTimeout(() => setError(null), 3000);
    }
  };

  return (
    <div className="rounded border border-border bg-card p-2">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Schools
        </span>
        <span className="text-[11px] text-muted-foreground">
          {groups.length} · {players.length} players
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" data-testid="group-strip">
        {groups.map((g) => {
          const count = players.filter((p) => p.groupId === g.id).length;
          const isEditing = editing === g.id;
          return (
            <span
              key={g.id}
              className="group relative inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs transition-colors hover:border-border"
              data-testid={`school-chip-${g.id}`}
            >
              {isEditing ? (
                <input
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onBlur={() => commitRename(g.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(g.id);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  className="w-28 border-none bg-transparent text-xs outline-none"
                />
              ) : (
                <button
                  type="button"
                  onDoubleClick={() => {
                    setEditing(g.id);
                    setEditDraft(g.name);
                  }}
                  className="text-foreground"
                  title="Double-click to rename"
                >
                  {g.name}
                </button>
              )}
              <span className="tabular-nums text-muted-foreground">{count}</span>
              <button
                type="button"
                onClick={() => handleDelete(g)}
                className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-red-600"
                title="Delete school"
                aria-label={`Delete ${g.name}`}
              >
                ×
              </button>
            </span>
          );
        })}
        {creating ? (
          <input
            autoFocus
            placeholder="School name…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitCreate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCreate();
              if (e.key === 'Escape') {
                setDraft('');
                setCreating(false);
              }
            }}
            className="rounded-full border border-dashed border-blue-400 bg-blue-50 px-2.5 py-0.5 text-xs outline-none w-36 focus:bg-card dark:bg-blue-500/10 dark:text-blue-100"
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground hover:border-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            data-testid="add-school"
          >
            <span aria-hidden>＋</span>Add school
          </button>
        )}
      </div>
      {error ? (
        <div className="mt-1.5 text-[11px] text-red-600">{error}</div>
      ) : null}
    </div>
  );
}
