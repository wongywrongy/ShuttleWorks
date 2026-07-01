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
  /** Section switcher entries (rendered as the bar's Seg). */
  sections: { value: string; label: string }[];
  section: string;
  onSectionChange: (value: string) => void;
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
        <Seg
          options={sections}
          value={section}
          onChange={onSectionChange}
          ariaLabel="Configuration section"
        />
        {actions}
      </ActionsBar>
      {ribbons}
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-6 pt-3">{children}</div>
    </div>
  );
}

/**
 * LockedFieldset — disables every form control beneath it while a
 * schedule/draw lock is active. The visual dim + native `disabled`
 * cascade give a real lock mechanism to surfaces that persist
 * immediately (no Save step to guard with a confirm-unlock modal).
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
      className={locked ? 'opacity-60' : undefined}
      data-locked={locked || undefined}
    >
      {children}
    </fieldset>
  );
}
