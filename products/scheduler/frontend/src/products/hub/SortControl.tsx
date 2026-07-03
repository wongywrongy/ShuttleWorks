/**
 * Hub list sort control — the redesign's `↕ {order}` selector at the right of
 * the facet strip. A styled native <select> (accessible, keyboard-friendly);
 * the ↕ glyph carries the "sort" affordance the mockup draws.
 */
import { HUB_SORTS, type HubSortId } from './hubSort';

export function SortControl({
  value,
  onChange,
}: {
  value: HubSortId;
  onChange: (id: HubSortId) => void;
}) {
  return (
    <label className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-transparent px-2 text-xs text-muted-foreground hover:text-foreground">
      <span aria-hidden>↕</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as HubSortId)}
        aria-label="Sort workspaces"
        className="cursor-pointer bg-transparent pr-1 text-xs text-inherit focus:outline-none"
      >
        {HUB_SORTS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
