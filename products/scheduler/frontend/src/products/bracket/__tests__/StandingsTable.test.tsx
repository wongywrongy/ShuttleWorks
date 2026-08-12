import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StandingsTable, STANDINGS_COLUMNS } from '../StandingsTable';
import {
  bandedRowLines,
  dockMinContentWidth,
} from '../../../components/control-plane';
import type { StandingRowDTO } from '../../../api/bracketDto';

function row(
  position: number,
  id: string,
  wins: number,
  losses: number,
): StandingRowDTO {
  return {
    participant_id: id,
    played: wins + losses,
    wins,
    losses,
    games_won: wins * 2,
    games_lost: losses,
    points_won: 40 + wins,
    points_lost: 30 + losses,
    position,
  };
}

const NAMES = { p1: 'Alice', p2: 'Bob', p3: 'Cara' };

describe('StandingsTable', () => {
  it('renders rows in position order regardless of input order', () => {
    render(
      <StandingsTable
        rows={[row(2, 'p2', 2, 1), row(1, 'p1', 3, 0), row(3, 'p3', 1, 2)]}
        nameById={NAMES}
      />,
    );
    const table = screen.getByTestId('standings-table');
    const rows = within(table).getAllByTestId(/^standings-row-/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'standings-row-1',
      'standings-row-2',
      'standings-row-3',
    ]);
    expect(rows[0]).toHaveTextContent('Alice');
    expect(rows[1]).toHaveTextContent('Bob');
    expect(rows[2]).toHaveTextContent('Cara');
  });

  it('formats W–L, games and points as en-dashed pairs', () => {
    render(
      <StandingsTable
        rows={[row(1, 'p1', 3, 0), row(2, 'p2', 2, 1)]}
        nameById={NAMES}
      />,
    );
    const first = screen.getByTestId('standings-row-1');
    expect(first).toHaveTextContent('3–0'); // W–L
    expect(first).toHaveTextContent('6–0'); // games
    expect(first).toHaveTextContent('43–30'); // points
    const second = screen.getByTestId('standings-row-2');
    expect(second).toHaveTextContent('2–1');
    expect(second).toHaveTextContent('4–1');
  });

  it('gives position 1 the accent Pos cell and falls back to raw ids', () => {
    render(
      <StandingsTable
        rows={[row(1, 'p1', 3, 0), row(2, 'unknown-id', 0, 3)]}
        nameById={NAMES}
      />,
    );
    const pos1 = screen.getByTestId('standings-pos-1');
    expect(pos1).toHaveTextContent('1');
    expect(pos1.className).toContain('text-accent');
    // Non-leader Pos cells stay muted.
    const second = screen.getByTestId('standings-row-2');
    expect(second.querySelector('span')!.className).not.toContain('text-accent');
    // Unmapped participant ids render as-is rather than blank.
    expect(second).toHaveTextContent('unknown-id');
  });
});

/* The Player column carries `Participant.name` — a player OR a team, so a long
 * organisation name is in-vocabulary. It is a name column like any other, and
 * that has two consequences a later edit could break silently. */
describe('StandingsTable geometry', () => {
  it('reserves two lines, because it carries a name that wraps', () => {
    expect(bandedRowLines(STANDINGS_COLUMNS)).toBe(2);
  });

  it('fits inside the rail DrawView gives it', () => {
    // The Player floor (NAME_COL_MIN) makes this table's minimum content
    // width 404px. The rail is `xl:w-[28rem]` with `p-4` and the card's 1px
    // borders; at the previous `w-96` the row overflowed the card by ~52px
    // and `overflow-hidden` clipped the Points column.
    const src = readFileSync(
      resolve(__dirname, '../DrawView.tsx'),
      'utf8',
    );
    const rail = /xl:w-\[(\d+(?:\.\d+)?)rem\]/.exec(src);
    expect(rail, 'StandingsAside declares no rem rail width').not.toBeNull();
    const RAIL_PADDING_PX = 32; // aside `p-4`, both sides
    const CARD_BORDER_PX = 2; // the standings card's 1px border, both sides
    expect(Number(rail![1]) * 16).toBeGreaterThanOrEqual(
      dockMinContentWidth(STANDINGS_COLUMNS) + RAIL_PADDING_PX + CARD_BORDER_PX,
    );
  });
});
