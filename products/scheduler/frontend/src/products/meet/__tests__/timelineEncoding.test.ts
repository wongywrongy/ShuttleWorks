import { describe, it, expect } from 'vitest';
import {
  LIFECYCLE_STYLES,
  exceptionFor,
  lifecycleOf,
} from '../timelineEncoding';
import type { MatchStateDTO } from '../../../api/dto';

describe('timelineEncoding — the shared Run/Plan color language', () => {
  it('lifecycleOf defaults to scheduled and passes statuses through', () => {
    expect(lifecycleOf(undefined)).toBe('scheduled');
    expect(lifecycleOf({ matchId: 'm', status: 'started' } as MatchStateDTO)).toBe('started');
  });

  it('in progress is the accent, not green; finished is dimmed neutral', () => {
    expect(LIFECYCLE_STYLES.started.bg).toContain('accent');
    for (const s of Object.values(LIFECYCLE_STYLES)) {
      expect(s.bg).not.toMatch(/status-live|green/);
    }
    expect(LIFECYCLE_STYLES.finished.text).toBe('text-muted-foreground');
  });

  it('exception priority: blocked > postponed > late; each pairs hue with glyph/dash', () => {
    const base = { baseBorder: 'border-border' };
    const blocked = exceptionFor({ ...base, isBlocked: true, isPostponed: true, isLate: true });
    expect(blocked.border).toBe('border-status-blocked');
    expect(blocked.Glyph).toBeTruthy(); // danger always carries a glyph

    const postponed = exceptionFor({ ...base, isPostponed: true, isLate: true });
    expect(postponed.border).toContain('border-dashed'); // dash, no hue
    expect(postponed.Glyph).toBeNull();

    const late = exceptionFor({ ...base, isLate: true });
    expect(late.border).toBe('border-status-warning');
    expect(late.Glyph).toBeTruthy(); // warning always carries a glyph

    const none = exceptionFor(base);
    expect(none.border).toBe('border-border');
    expect(none.Glyph).toBeNull();
  });
});
