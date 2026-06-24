/** Honest placeholder for a settings area not yet built — describes what will
 *  live here without faking controls. */
export function ComingSoonTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <div className="max-w-sm">
        <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <p className="mt-1 text-xs text-muted-foreground/60">Coming in a later phase.</p>
      </div>
    </div>
  );
}
