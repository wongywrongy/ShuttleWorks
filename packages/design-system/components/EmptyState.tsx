import type { ReactNode } from 'react';

import { Button } from './Button';
import { EYEBROW_CLASS } from './textStyles';

/**
 * EmptyState — the empty/zero-state, in the product's three registers
 * (ADR 0020). One component, three explicit variants; each variant's
 * markup is byte-for-byte the rendering its tier shipped before the
 * consolidation, so adopting this component moved no pixels:
 *
 * - `centered` — the console zero-state: centered column, title/body,
 *   free-form `action` slot (a CTA button the caller styles).
 * - `card` — the public-register empty result: a left-aligned card, at
 *   most one link action. A card, not a dashed outline (SP-P7 §3.8) —
 *   dashed is the drop-target idiom, the opposite of an empty result.
 *   SSR-safe: no handlers; the action is a real `<a>`.
 * - `editorial` — the bracket module's placeholder essay: eyebrow, h2,
 *   measured body, one brand CTA. Takes `onAction` — console use only
 *   (the entrant tier ships no hydration, so a handler would be inert).
 *
 * Class strings are plain literals per variant (no `cn()`): twMerge
 * could reorder or dedupe, and each rendered string is pinned by that
 * tier's tests.
 */
export type EmptyStateProps =
  | {
      variant: 'centered';
      title: string;
      body?: string;
      action?: ReactNode;
    }
  | {
      variant: 'card';
      heading: string;
      body: string;
      action?: { label: string; href: string };
    }
  | {
      variant: 'editorial';
      eyebrow: string;
      title: string;
      body: string;
      actionLabel?: string;
      onAction?: () => void;
    };

export function EmptyState(props: EmptyStateProps) {
  if (props.variant === 'centered') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center">
        <p className="text-base font-semibold text-foreground">{props.title}</p>
        {props.body ? (
          <p className="max-w-sm text-sm text-muted-foreground">{props.body}</p>
        ) : null}
        {props.action ? <div className="mt-2">{props.action}</div> : null}
      </div>
    );
  }

  if (props.variant === 'card') {
    return (
      <div className="grid justify-items-start gap-3 rounded-lg border border-rule-soft bg-surface-raised p-8 shadow-sm">
        <p className="text-base font-medium text-foreground">{props.heading}</p>
        <p className="text-sm text-muted-foreground">{props.body}</p>
        {props.action ? (
          <Button asChild variant="outline" size="sm">
            <a href={props.action.href}>{props.action.label}</a>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <section className="mx-auto flex min-h-[280px] max-w-3xl flex-col justify-center px-6 py-10">
      <div className="border-t border-border pt-5">
        <p className={`${EYEBROW_CLASS} text-muted-foreground`}>{props.eyebrow}</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
          {props.title}
        </h2>
        <p className="mt-2 max-w-[58ch] text-sm leading-6 text-muted-foreground">
          {props.body}
        </p>
        {props.actionLabel && props.onAction ? (
          <div className="mt-5">
            <Button type="button" variant="brand" size="sm" onClick={props.onAction}>
              {props.actionLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
