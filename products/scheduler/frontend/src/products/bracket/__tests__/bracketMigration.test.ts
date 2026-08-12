import { describe, it, expect } from 'vitest';
import { reconcileBracketRoster } from '../bracketMigration';
import type { BracketTournamentDTO } from '../../../api/bracketDto';

describe('reconcileBracketRoster', () => {
  it('extracts unique players from PLAYER participants', () => {
    const bracket = {
      participants: [
        { id: 'p-alex-tan', name: 'Alex Tan' },
        { id: 'p-ben-carter', name: 'Ben Carter' },
      ],
    } as unknown as BracketTournamentDTO;
    const result = reconcileBracketRoster(bracket);
    expect(result.map((p) => p.id).sort()).toEqual([
      'p-alex-tan',
      'p-ben-carter',
    ]);
    expect(result.find((p) => p.id === 'p-alex-tan')?.name).toBe('Alex Tan');
  });

  it('flattens TEAM members and dedupes by id', () => {
    const bracket = {
      participants: [
        { id: 'MS-T1', name: 'Alex / Ben', members: ['p-alex', 'p-ben'] },
        { id: 'p-alex', name: 'Alex Tan' },
      ],
    } as unknown as BracketTournamentDTO;
    const result = reconcileBracketRoster(bracket);
    const ids = result.map((p) => p.id);
    expect(ids).toContain('p-alex');
    expect(ids).toContain('p-ben');
    // dedup: p-alex should appear once.
    const seen = new Set(ids);
    expect(seen.size).toBe(ids.length);
    // name resolution: p-alex has a PLAYER entry → must use display name, not slug.
    expect(result.find((p) => p.id === 'p-alex')?.name).toBe('Alex Tan');
  });

  // D3 — the Bracket roster shipped raw slugs ("alexei-sorokin") as player
  // names. A doubles-only draw has NO player participants, so the slug→name
  // lookup was empty and every member fell back to its own id.
  it('reads TEAM member names off the team display name (doubles-only draw)', () => {
    const bracket = {
      participants: [
        {
          id: 'MD-T1',
          name: 'Alexei Sorokin / Ben Carter',
          members: ['p-alexei-sorokin', 'p-ben-carter'],
        },
      ],
    } as unknown as BracketTournamentDTO;
    const byId = new Map(
      reconcileBracketRoster(bracket).map((p) => [p.id, p.name]),
    );
    expect(byId.get('p-alexei-sorokin')).toBe('Alexei Sorokin');
    expect(byId.get('p-ben-carter')).toBe('Ben Carter');
  });

  it('de-slugs members the team name cannot account for', () => {
    const bracket = {
      participants: [
        // Name and members disagree in arity — nothing positional to read.
        {
          id: 'MD-T1',
          name: 'Team One',
          members: ['p-alexei-sorokin', 'p-ben-carter'],
        },
      ],
    } as unknown as BracketTournamentDTO;
    expect(reconcileBracketRoster(bracket).map((p) => p.name)).toEqual([
      'Alexei Sorokin',
      'Ben Carter',
    ]);
  });

  it('returns empty when bracket has no participants', () => {
    const bracket = { participants: [] } as unknown as BracketTournamentDTO;
    expect(reconcileBracketRoster(bracket)).toEqual([]);
  });
});
