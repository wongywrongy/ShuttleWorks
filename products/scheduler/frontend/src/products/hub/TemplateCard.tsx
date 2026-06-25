import type { Template } from './newWorkspaceTemplates';
import { MODULE_LABELS } from './newWorkspaceTemplates';

/** A selectable workspace-template card. Modules are shown as chips that
 *  distinguish enabled (accent-filled) from available (outline) — the Hub chip
 *  language — so the operator sees what's on vs. what they can turn on later. */
export function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: Template;
  selected: boolean;
  onSelect: () => void;
}) {
  const chips = template.seed.filter((m) => m.status === 'enabled' || m.status === 'available');
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-testid={`template-${template.id}`}
      onClick={onSelect}
      className={[
        'flex flex-col gap-2 rounded-md border p-4 text-left transition-colors',
        selected ? 'border-foreground bg-muted/30' : 'border-border hover:bg-muted/40',
      ].join(' ')}
    >
      <div className="text-sm font-semibold text-foreground">{template.title}</div>
      <div className="text-xs text-muted-foreground">{template.blurb}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {chips.map((m) => (
          <span
            key={m.moduleId}
            aria-label={`${MODULE_LABELS[m.moduleId]} — ${m.status}`}
            data-testid={`tplchip-${m.moduleId}`}
            data-status={m.status}
            className={[
              'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-2xs font-medium',
              m.status === 'enabled'
                ? 'bg-accent/10 text-accent'
                : 'border border-border text-muted-foreground',
            ].join(' ')}
          >
            <span
              aria-hidden
              className={[
                'h-1 w-1 shrink-0 rounded-full',
                m.status === 'enabled' ? 'bg-accent' : 'border border-accent',
              ].join(' ')}
            />
            {MODULE_LABELS[m.moduleId]}
          </span>
        ))}
      </div>
    </button>
  );
}
