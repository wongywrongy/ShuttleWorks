import type { ReactNode } from 'react';
import { Link, type To } from 'react-router-dom';

export type ActiveChoiceGeometry = 'row' | 'segment';
export type ActiveChoiceSemantics = 'page' | 'tab' | 'radio' | 'pressed';

export interface ActiveChoiceProps {
  active: boolean;
  geometry: ActiveChoiceGeometry;
  semantics: ActiveChoiceSemantics;
  children: ReactNode;
  className?: string;
  to?: To;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  title?: string;
  id?: string;
  tabIndex?: number;
  'aria-label'?: string;
  'data-testid'?: string;
  onClick?: () => void;
}

const GEOMETRY_CLASS: Record<ActiveChoiceGeometry, string> = {
  row: 'rounded-sm text-left',
  segment: 'rounded-md text-center',
};

function semanticsFor(semantics: ActiveChoiceSemantics, active: boolean) {
  if (semantics === 'page') {
    return { 'aria-current': active ? ('page' as const) : undefined };
  }
  if (semantics === 'tab') {
    return { role: 'tab' as const, 'aria-selected': active };
  }
  if (semantics === 'radio') {
    return { role: 'radio' as const, 'aria-checked': active };
  }
  return { 'aria-pressed': active };
}

/**
 * The console's single visual owner for route, tab, segmented, and filter
 * selection. Callers own layout and content; this component alone owns the
 * selected fill, ink, focus treatment, and accessible state attribute.
 */
export function ActiveChoice({
  active,
  geometry,
  semantics,
  children,
  className = '',
  to,
  type = 'button',
  disabled,
  title,
  id,
  tabIndex,
  'aria-label': ariaLabel,
  'data-testid': testId,
  onClick,
}: ActiveChoiceProps) {
  const semanticProps = semanticsFor(semantics, active);
  const classes = [
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
    GEOMETRY_CLASS[geometry],
    active
      ? 'bg-action-primary text-text-on-accent focus-visible:ring-text-on-accent'
      : 'text-foreground hover:bg-surface-hover focus-visible:ring-ring',
    disabled ? 'cursor-not-allowed opacity-60' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (to !== undefined) {
    return (
      <Link
        to={to}
        className={classes}
        title={title}
        id={id}
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        data-testid={testId}
        onClick={onClick}
        {...semanticProps}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      title={title}
      id={id}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      data-testid={testId}
      onClick={onClick}
      {...semanticProps}
    >
      {children}
    </button>
  );
}
