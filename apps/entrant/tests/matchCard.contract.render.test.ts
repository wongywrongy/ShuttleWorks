/**
 * Match-card contract §6.1 (package 11): the Gate B fixture matrix driven
 * through the entrant `MatchCard`'s `card` and `bracket-node` variants,
 * asserting the semantic outcomes the contract requires — never identical
 * DOM, never a fixed `offsetHeight`, never "which score is larger".
 *
 * `.ts`, not `.tsx` — this package's vitest include and tsconfig only take
 * `tests/**\/*.ts` (see `components.test.ts`'s note); `createElement`
 * stands in for JSX.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MatchCard } from '../app/components/MatchCard';
import { matchCardFixtures as MC } from './helpers/matchCardFixtures';

const SLUG = 'spring-open';

function renderCard(match: Parameters<typeof MatchCard>[0]['match']) {
  return renderToStaticMarkup(h(MatchCard, { match, slug: SLUG }));
}
function renderNode(match: Parameters<typeof MatchCard>[0]['match']) {
  return renderToStaticMarkup(h(MatchCard, { match, slug: SLUG, variant: 'bracket-node' }));
}

const BANNED = [/^TBD$/, /^–$/, /No players/];

describe('match-card contract — banned placeholder vocabulary (§2.1/§6.1)', () => {
  it.each(Object.entries(MC).filter(([key]) => key !== 'formats'))(
    '%s renders no banned placeholder string',
    (_name, match) => {
      const html = renderCard(match as never);
      for (const pattern of BANNED) expect(html).not.toMatch(pattern);
    },
  );
});

describe('match-card contract — the winner mark (§3.5)', () => {
  it.each(['singlesScheduled', 'unresolvedPredecessor', 'noSchedule', 'liveWithLead', 'bye'] as const)(
    '%s never shows the winner mark while unfinished', (name) => {
      const html = renderCard(MC[name]);
      expect(html).not.toMatch(/Winner: /);
    },
  );

  it.each(['completedLoserWonAGame', 'walkover', 'retirement'] as const)(
    '%s carries the accessible word "Winner" on the winning side', (name) => {
      const html = renderCard(MC[name]);
      expect(html).toMatch(/Winner: /);
    },
  );
});

describe('match-card contract — the ledger (§2.7/§3.4)', () => {
  it('MC-01 (no games) renders no score cell at all', () => {
    const html = renderCard(MC.singlesScheduled);
    expect(html).not.toMatch(/place-items-center/);
  });

  it('MC-07: game 2 (in progress) emphasises neither side', () => {
    const html = renderCard(MC.liveWithLead);
    // Two games recorded; neither side carries the match-winner mark while live.
    expect(html).not.toMatch(/Winner: /);
    expect((html.match(/place-items-center/g) ?? []).length).toBe(4); // 2 games x 2 sides
  });

  it('MC-08: three columns; the losing side still wins the game-2 cell (independent of match winner)', () => {
    const html = renderCard(MC.completedLoserWonAGame);
    expect((html.match(/place-items-center/g) ?? []).length).toBe(6); // 3 games x 2 sides
  });

  it('MC-09 (walkover, no games) collapses the ledger entirely, but still states the winner', () => {
    const html = renderCard(MC.walkover);
    expect(html).not.toMatch(/place-items-center/);
    expect(html).toMatch(/Winner: /);
  });

  it('MC-13: the ledger is never padded to a configured maximum — exactly 1 / 3 / 5 columns', () => {
    expect((renderCard(MC.formats.oneGame).match(/place-items-center/g) ?? []).length).toBe(2);
    expect((renderCard(MC.formats.bestOfThree).match(/place-items-center/g) ?? []).length).toBe(6);
    expect((renderCard(MC.formats.bestOfFive).match(/place-items-center/g) ?? []).length).toBe(10);
  });
});

describe('match-card contract — state and schedule words (§3.3)', () => {
  it('a live match reads "On court", never "Live"', () => {
    const html = renderCard(MC.liveWithLead);
    expect(html).toContain('On court');
    expect(html).not.toContain('>Live<');
  });

  it('a routine live card carries no saturated fill (V3-PE09.4)', () => {
    const html = renderCard(MC.liveWithLead);
    expect(html).not.toContain('bg-status-live');
  });

  it('the public schedule word is exactly "Scheduled" or "Time to be confirmed"', () => {
    expect(renderCard(MC.singlesScheduled)).toContain('10:00');
    expect(renderCard(MC.noSchedule)).toContain('Time to be confirmed');
  });
});

describe('match-card contract — bracket node (§4.3)', () => {
  it('every node carries a visible human match number (V3-PE10.1)', () => {
    expect(renderNode(MC.singlesScheduled)).toContain('Match 1');
    expect(renderNode(MC.unresolvedPredecessor)).toContain('Match 5');
  });

  it('an unresolved predecessor renders its label, never inventing a person', () => {
    const html = renderNode(MC.unresolvedPredecessor);
    expect(html).toContain('Winner of QF1');
  });

  it('a bye side renders "Bye" in the same structure as a name', () => {
    const html = renderNode(MC.bye);
    expect(html).toContain('Bye');
  });

  it('a withheld side renders the fixed dead-reference label, never a raw hole', () => {
    const html = renderNode(MC.withheldSide);
    expect(html).toContain('Player not published');
  });

  it('doubles partners stack one per line, never slash-joined (V3-PE14.1)', () => {
    const html = renderNode(MC.doublesScheduled);
    expect(html).not.toMatch(/Ada Lovelace\s*\/\s*Grace Hopper/);
    expect(html).not.toContain('>/<');
  });

  it('MC-04: a pending pair names the known player AND says the partner is unconfirmed', () => {
    const html = renderNode(MC.incompletePair);
    // The known name is present...
    expect(html).toContain('Ada Lovelace');
    // ...AND the §6.1 phrase, so the side cannot be read as singles.
    expect(html).toContain('partner to be confirmed');
    // Never an invented second person and never a slash-joined pair label.
    expect(html).not.toContain('>/<');
  });

  it('MC-04: the complete pair on the other side gains no pending phrase', () => {
    const html = renderNode(MC.incompletePair);
    expect((html.match(/partner to be confirmed/g) ?? []).length).toBe(2); // one visible line + the aria phrase
  });

  it('long diacritic names survive whole, with no ellipsis or truncate class (MC-03)', () => {
    const html = renderNode(MC.longNamesDoubles);
    expect(html).toContain('Aleksandra Wiśniewska-Kowalczyk');
    expect(html).toContain('Ratchanok Intanon-Wongsuwannakit');
    expect(html).not.toContain('…');
    expect(html).not.toMatch(/\btruncate\b/);
  });
});

describe('match-card contract — accessible summary (§6.1 "versus"/"and")', () => {
  it('joins persons within a side with "and" and sides with "versus"', () => {
    const html = renderNode(MC.doublesScheduled);
    expect(html).toContain('Ada Lovelace and Grace Hopper versus Katherine Johnson and Hedy Lamarr');
  });

  it('an unresolved side folds into the phrase by its label, not a slash join', () => {
    const html = renderNode(MC.unresolvedPredecessor);
    expect(html).toContain('Ada Lovelace versus Winner of QF1');
  });

  it('MC-04: the pending partner is a term in the phrase, joined with "and"', () => {
    const html = renderNode(MC.incompletePair);
    expect(html).toContain(
      'Ada Lovelace and partner to be confirmed versus Katherine Johnson and Hedy Lamarr',
    );
  });
});

describe('match-card contract — labels come from the discriminant (§2.1/§6.1)', () => {
  it('a winner_of side is spelled from `unresolved.reference`, not the placeholder prose', () => {
    // Same fixture, placeholder deliberately contradicting the discriminant:
    // the renderer must follow the discriminant.
    const match = {
      ...MC.unresolvedPredecessor,
      sides: [
        MC.unresolvedPredecessor.sides[0],
        { persons: [], placeholder: 'Winner of NONSENSE', winner: false, unresolved: { kind: 'loser_of' as const, reference: 'SF 2' } },
      ] as typeof MC.unresolvedPredecessor.sides,
    };
    const html = renderNode(match);
    expect(html).toContain('Loser of SF 2');
    expect(html).not.toContain('NONSENSE');
  });

  it('an undetermined side reads "To be decided", never the wire\'s legacy TBD', () => {
    const match = {
      ...MC.unresolvedPredecessor,
      sides: [
        MC.unresolvedPredecessor.sides[0],
        { persons: [], placeholder: 'TBD', winner: false, unresolved: { kind: 'undetermined' as const } },
      ] as typeof MC.unresolvedPredecessor.sides,
    };
    const html = renderNode(match);
    expect(html).toContain('To be decided');
    expect(html).not.toMatch(/>TBD</);
  });
});
