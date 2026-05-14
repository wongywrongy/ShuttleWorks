/**
 * SetupForm — pure helpers + the EventDraft shape consumed by the form
 * and the EventEditor sub-component.
 */

export interface EventDraft {
  id: string;
  discipline: string;
  format: 'se' | 'rr';
  participantsText: string;
  rrRounds: number;
  durationSlots: number;
  bracketSize?: number;
  seededCount?: number;
}

export const SAMPLE_8 = `Alice
Bob
Carla
Dani
Erin
Felix
Grace
Hugo`;

export const SAMPLE_32 = Array.from(
  { length: 32 },
  (_, i) => `Seed ${i + 1}`
).join('\n');

export const SAMPLE_DOUBLES = `Alice / Anna
Bob / Brent
Carla / Cora
Dani / Drew`;

export function emptyEvent(id: string, discipline = 'MS'): EventDraft {
  return {
    id,
    discipline,
    format: 'se',
    participantsText: SAMPLE_8,
    rrRounds: 1,
    durationSlots: 1,
  };
}

export function playerSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `p-${slug || 'player'}`;
}

export function defaultStartTime(): string {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  );
}
