/** A list loading placeholder: `rows` animate-pulse lines mocking the name (left)
 *  + trailing-value (right) columns of the workspace list. Each row carries
 *  `data-testid="skeleton-row"`. */
export function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} data-testid="skeleton-row" className="flex items-center gap-4 px-4 py-3">
          <div className="h-3 w-40 animate-pulse rounded bg-muted" />
          <div className="ml-auto h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
