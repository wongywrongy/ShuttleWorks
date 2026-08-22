/**
 * PageBody — the one content container for a workspace surface (LAY-1).
 *
 * Before this, the console had FOUR content families and three gutter
 * values. The two that looked most alike were the same box measured twice:
 * `/setup` and `/ws-venue` both centred a `max-w-3xl` column in the same
 * area, but one spent its gutter outside the scroll region (`px-4`) and the
 * other inside the column (`p-6`), so their text started 24px apart and read
 * as two different anchors in the surface report.
 *
 * Three variants, because the console genuinely has three kinds of surface:
 *
 *   - `data`  — full-bleed with page gutters. Tables and grids earn the whole
 *               width; bounding them would hide columns to no purpose.
 *   - `form`  — a bounded, centred column for declarative controls.
 *   - `prose` — nested INSIDE `form` for descriptive paragraphs. The form
 *               column is wider than readable prose, so section intros and
 *               rule explanations get their own character-based bound rather
 *               than running the full width of the controls beside them.
 *
 * `prose` is measured in `ch`, not px: the readable band is 45–75 characters
 * (WCAG 1.4.8 caps non-CJK at 80), which is a property of the text, not of
 * the viewport — a px bound silently leaves that band the moment the type
 * scale moves.
 */
import type { ReactNode } from 'react';

export type PageBodyVariant = 'data' | 'form' | 'prose';

/** The width bound per variant. Exported so the container test asserts the
 *  same strings the component renders, and so a surface cannot quietly
 *  reintroduce a fifth anchor by hand-rolling `mx-auto max-w-*`.
 *
 *  `PAGE_BODY_WIDTH.prose` is also applied DIRECTLY to a lone `<p>` rather
 *  than wrapping it — a single paragraph does not need a container element,
 *  and six wrapper divs to carry one class each is scaffolding. The bound
 *  still comes from this table, so there is one definition either way. */
export const PAGE_BODY_WIDTH: Record<PageBodyVariant, string> = {
  data: 'w-full',
  form: 'mx-auto w-full max-w-[900px]',
  prose: 'max-w-[68ch]',
};

/** One gutter value for the whole product. `prose` takes none — it is nested
 *  inside a `form` body that already paid for it. */
const PAGE_BODY_GUTTER: Record<PageBodyVariant, string> = {
  data: 'px-6 py-6',
  form: 'px-6 py-6',
  prose: '',
};

export function PageBody({
  variant,
  className,
  children,
}: {
  variant: PageBodyVariant;
  /** Surface-specific spacing (e.g. `space-y-4`) — never a width or a gutter. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-page-body={variant}
      className={[PAGE_BODY_WIDTH[variant], PAGE_BODY_GUTTER[variant], className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
