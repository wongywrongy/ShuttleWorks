import { describe, it, expect } from 'vitest';
import { reconcileBracketRoster } from '../../features/bracket/bracketMigration';
import type { BracketTournamentDTO } from '../../api/bracketDto';

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

  it('returns empty when bracket has no participants', () => {
    const bracket = { participants: [] } as unknown as BracketTournamentDTO;
    expect(reconcileBracketRoster(bracket)).toEqual([]);
  });
});
