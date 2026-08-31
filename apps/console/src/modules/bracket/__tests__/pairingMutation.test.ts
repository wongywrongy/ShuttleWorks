import { describe, it, expect, vi } from 'vitest';
import type { BracketEventDTO } from '../eventUpsertPayload';
import {
  applyBracketPairingCommand,
  commitBracketPairing,
  PAIRING_LOCKED_REASON,
} from '../pairingMutation';

const event = (participants: BracketEventDTO['participants']): BracketEventDTO =>
  ({
    id: 'MD',
    discipline: 'MD',
    format: 'se',
    participants,
  }) as BracketEventDTO;

describe('canonical Bracket pairing mutation', () => {
  it('assigns a TEAM while preserving unaffected rows and player metadata', () => {
    expect(
      applyBracketPairingCommand(
        event([
          { id: 'p-other', name: 'Other', seed: 3, entryPlayerId: 'ep-other' },
        ]),
        {
          type: 'assign',
          player: { id: 'p-ana', name: 'Ana', entryPlayerId: 'ep-ana' },
          partner: { id: 'p-bruno', name: 'Bruno', entryPlayerId: 'ep-bruno' },
        },
      ),
    ).toEqual([
      { id: 'p-other', name: 'Other', seed: 3, entryPlayerId: 'ep-other' },
      {
        id: 'MD-T1',
        name: 'Ana / Bruno',
        members: ['p-ana', 'p-bruno'],
        entryPlayerId: 'ep-ana',
      },
    ]);
  });

  it('consumes a partner singleton when assigning a TEAM', () => {
    expect(
      applyBracketPairingCommand(
        event([
          { id: 'p-bruno', name: 'Bruno', seed: 6 },
          { id: 'p-other', name: 'Other', entryPlayerId: 'ep-other' },
        ]),
        {
          type: 'assign',
          player: { id: 'p-ana', name: 'Ana' },
          partner: { id: 'p-bruno', name: 'Bruno' },
        },
      ),
    ).toEqual([
      { id: 'p-other', name: 'Other', entryPlayerId: 'ep-other' },
      { id: 'MD-T1', name: 'Ana / Bruno', members: ['p-ana', 'p-bruno'] },
    ]);
  });

  it('changes a pair in place while preserving the TEAM seed and person key', () => {
    expect(
      applyBracketPairingCommand(
        event([
          {
            id: 'MD-T4',
            name: 'Ana / Bruno',
            members: ['p-ana', 'p-bruno'],
            seed: 2,
            entryPlayerId: 'ep-ana',
          },
          { id: 'p-other', name: 'Other', seed: 4 },
        ]),
        {
          type: 'change',
          player: { id: 'p-ana', name: 'Ana', entryPlayerId: 'ep-ana' },
          partner: { id: 'p-cleo', name: 'Cleo' },
        },
      ),
    ).toEqual([
      {
        id: 'MD-T4',
        name: 'Ana / Cleo',
        members: ['p-ana', 'p-cleo'],
        seed: 2,
        entryPlayerId: 'ep-ana',
      },
      { id: 'p-other', name: 'Other', seed: 4 },
    ]);
  });

  it('removes a singleton when changing to that available partner', () => {
    expect(
      applyBracketPairingCommand(
        event([
          { id: 'MD-T4', name: 'Ana / Bruno', members: ['p-ana', 'p-bruno'] },
          { id: 'p-cleo', name: 'Cleo', seed: 7 },
        ]),
        {
          type: 'change',
          player: { id: 'p-ana', name: 'Ana' },
          partner: { id: 'p-cleo', name: 'Cleo' },
        },
      ),
    ).toEqual([
      { id: 'MD-T4', name: 'Ana / Cleo', members: ['p-ana', 'p-cleo'] },
    ]);
  });

  it('moves the TEAM person key with the selected member on change', () => {
    expect(
      applyBracketPairingCommand(
        event([
          {
            id: 'MD-T4',
            name: 'Ana / Bruno',
            members: ['p-ana', 'p-bruno'],
            entryPlayerId: 'ep-ana',
            seed: 2,
          },
        ]),
        {
          type: 'change',
          player: { id: 'p-bruno', name: 'Bruno', entryPlayerId: 'ep-bruno' },
          partner: { id: 'p-cleo', name: 'Cleo' },
        },
      ),
    ).toEqual([
      {
        id: 'MD-T4',
        name: 'Bruno / Cleo',
        members: ['p-bruno', 'p-cleo'],
        seed: 2,
        entryPlayerId: 'ep-bruno',
      },
    ]);
  });

  it('dissolves by removing the TEAM row without creating singleton rows', () => {
    expect(
      applyBracketPairingCommand(
        event([
          {
            id: 'MD-T1',
            name: 'Ana / Bruno',
            members: ['p-ana', 'p-bruno'],
            seed: 1,
          },
          { id: 'MD-T2', name: 'Cleo / Dana', members: ['p-cleo', 'p-dana'] },
        ]),
        { type: 'dissolve', playerId: 'p-ana' },
      ),
    ).toEqual([
      { id: 'MD-T2', name: 'Cleo / Dana', members: ['p-cleo', 'p-dana'] },
    ]);
  });

  it('routes the draw-side replacement through the same participant seam', () => {
    const participants = [
      { id: 'MD-T8', name: 'Ana / Cleo', members: ['p-ana', 'p-cleo'], seed: 2 },
    ];
    expect(
      applyBracketPairingCommand(
        event([{ id: 'MD-T4', name: 'Ana / Bruno', members: ['p-ana', 'p-bruno'] }]),
        { type: 'replace', participants },
      ),
    ).toEqual(participants);
  });

  it('has one commit seam over the full-event upsert payload', async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    await commitBracketPairing(
      commit,
      event([{ id: 'p-other', name: 'Other', seed: 5 }]),
      {
        type: 'assign',
        player: { id: 'p-ana', name: 'Ana' },
        partner: { id: 'p-bruno', name: 'Bruno' },
      },
    );
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(
      'MD',
      expect.objectContaining({
        discipline: 'MD',
        format: 'se',
        participants: [
          { id: 'p-other', name: 'Other', seed: 5 },
          {
            id: 'MD-T1',
            name: 'Ana / Bruno',
            members: ['p-ana', 'p-bruno'],
          },
        ],
      }),
    );
  });

  it('rejects generated draws at the canonical seam before writing', async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const generated = {
      ...event([{ id: 'p-ana', name: 'Ana' }]),
      status: 'generated',
    } as BracketEventDTO;

    await expect(
      commitBracketPairing(commit, generated, {
        type: 'assign',
        player: { id: 'p-ana', name: 'Ana' },
        partner: { id: 'p-bruno', name: 'Bruno' },
      }),
    ).rejects.toThrow(PAIRING_LOCKED_REASON);
    expect(commit).not.toHaveBeenCalled();
  });
});
