/**
 * ConfigSurface — the shared Configuration-page archetype.
 *
 * Meet and Bracket are different modules with different settings, but a
 * director should read them as ONE surface: the same fixed ActionsBar
 * anatomy (`Configuration` eyebrow · section Seg · right-aligned actions),
 * the same full-bleed ribbon rows (lock indicator, hints, errors), and the
 * same scrollable form region. Each engine supplies only its sections and
 * its persist affordance (Meet: bar-level Save; Bracket: immediate writes).
 *
 * Pair with `SettingsControls` (`SectionHeader`/`Row`/`Seg`) inside the
 * children so the field grammar matches too.
 */
import type { ReactNode } from 'react';
import { ActionsBar } from '../../components/control-plane/ActionsBar';
import { Seg } from './SettingsControls';

export function ConfigSurface({
  sections,
  section,
  onSectionChange,
  actions,
  ribbons,
  children,
}: {
  /** Section switcher entries (rendered as the bar's Seg). OPTIONAL: a
   *  config surface that is a single merged form (Meet, since Events was
   *  folded into it) passes none and gets no switcher. A one-entry switcher
   *  is worse than no switcher. */
  sections?: { value: string; label: string }[];
  section?: string;
  onSectionChange?: (value: string) => void;
  /** Right-aligned bar actions (e.g. the Meet Save button). */
  actions?: ReactNode;
  /** Full-bleed `border-b` ribbon rows between the bar and the content
   *  (lock indicator, new-workspace hint, error banners). */
  ribbons?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ActionsBar title="Configuration">
        {sections && sections.length > 1 && section && onSectionChange ? (
          <Seg
            options={sections}
            value={section}
            onChange={onSectionChange}
            ariaLabel="Configuration section"
            // Toolbar, not a settings row.
            fill={false}
          />
        ) : null}
        {actions}
      </ActionsBar>
      {ribbons}
      {/* Gutter-free (LAY-1): the scroll region owns scrolling, `PageBody`
          owns the width and the gutter. This carried its own `px-4 pb-6 pt-3`
          while the form inside centred a `max-w-3xl` column with `p-6`, so
          Configuration's text started 8px inside where every settings page's
          did — the "two anchors" the surface report measured. */}
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

/**
 * LockedFieldset — locks every form control beneath it while a
 * schedule/draw lock is active. The native `disabled` cascade is the
 * ENFORCEMENT; the presentation is read-only, not dimmed-out: values
 * keep full contrast (`sw-readonly`, globals.css) because a locked
 * config is review data the operator still needs to read mid-tournament
 * — greying it is the classic enterprise anti-pattern. Interactive
 * affordances (Save) should be hidden by the form itself (see
 * EngineConfigForm's `readOnly`), not merely disabled here.
 */
export function LockedFieldset({
  locked,
  children,
}: {
  locked: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset
      disabled={locked}
      className={locked ? 'sw-readonly' : undefined}
      data-locked={locked || undefined}
    >
      {children}
    </fieldset>
  );
}
