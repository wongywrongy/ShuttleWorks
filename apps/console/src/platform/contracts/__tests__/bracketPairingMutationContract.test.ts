/** SP-PAIR-1 F-PAIR-12/16: every Bracket pair editor crosses one seam. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../..');
const read = (relative: string) =>
  readFileSync(path.join(SRC, relative), 'utf8');

const mutation = read('modules/bracket/pairingMutation.ts');
const playerFields = read('modules/bracket/BracketPlayerFields.tsx');
const draws = read('modules/bracket/BracketDrawsTab.tsx');
const picker = read('modules/bracket/ParticipantPicker.tsx');

describe('SP-PAIR-1 — canonical Bracket pairing write path', () => {
  it('owns payload construction and generated-draw locking in one seam', () => {
    expect(mutation).toContain('export async function commitBracketPairing');
    expect(mutation).toContain("(ev.status ?? 'draft') !== 'draft'");
    expect(mutation).toContain('buildEventUpsertPayload(ev, participants)');
  });

  it('routes player-side pairing through the canonical seam', () => {
    expect(playerFields).toContain('commitBracketPairing(onCommitEvent, ev, command)');
  });

  it('routes draw-side pair replacement and actions through the same seam', () => {
    expect(draws).toContain('await commitBracketPairing(commitEvent, ev, command)');
    expect(draws).toContain('await commitPairing(ev, { type: "replace", participants })');
  });

  it('keeps the picker projection-only with no API or event-upsert path', () => {
    expect(picker).not.toMatch(/useBracketApi|eventUpsert|buildEventUpsertPayload/);
  });
});
