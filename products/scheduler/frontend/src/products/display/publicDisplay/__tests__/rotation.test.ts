/**
 * Rotation engine (TV-5 / TV-7 / DC-3) — pure, so the sequence is testable
 * without a clock or a DOM.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DWELL_SECONDS,
  dwellSecondsFor,
  rotationSlides,
  slideAt,
} from '../rotation';

const ALL = { standings: true, upNext: true };

describe('rotationSlides', () => {
  it('rotates courts, standings, up next when everything has data', () => {
    expect(rotationSlides(ALL)).toEqual(['courts', 'standings', 'upNext']);
  });

  it('drops a slide with nothing to show — a blank screen on a wall is worse than no slide', () => {
    expect(rotationSlides({ standings: false, upNext: true })).toEqual(['courts', 'upNext']);
    expect(rotationSlides({ standings: true, upNext: false })).toEqual(['courts', 'standings']);
  });

  it('never drops courts, even with nothing at all to show', () => {
    expect(rotationSlides({ standings: false, upNext: false })).toEqual(['courts']);
  });

  it("honours the director's slide set", () => {
    expect(rotationSlides(ALL, ['courts', 'upNext'])).toEqual(['courts', 'upNext']);
  });

  it('ignores an unknown id from a stored blob rather than rendering a branch that does not exist', () => {
    expect(rotationSlides(ALL, ['courts', 'bracketDraw' as never])).toEqual(['courts']);
  });
});

describe('dwellSecondsFor', () => {
  it('gives courts twice the base — it is the working slide, the rest are glances', () => {
    expect(dwellSecondsFor('courts', DEFAULT_DWELL_SECONDS)).toBe(20);
    expect(dwellSecondsFor('standings', DEFAULT_DWELL_SECONDS)).toBe(10);
    expect(dwellSecondsFor('upNext', DEFAULT_DWELL_SECONDS)).toBe(10);
  });
});

describe('slideAt', () => {
  const slides = rotationSlides(ALL);

  it('walks the default 20 / 10 / 10 cycle', () => {
    expect(slideAt(slides, 0, DEFAULT_DWELL_SECONDS)).toBe('courts');
    expect(slideAt(slides, 19, DEFAULT_DWELL_SECONDS)).toBe('courts');
    expect(slideAt(slides, 20, DEFAULT_DWELL_SECONDS)).toBe('standings');
    expect(slideAt(slides, 29, DEFAULT_DWELL_SECONDS)).toBe('standings');
    expect(slideAt(slides, 30, DEFAULT_DWELL_SECONDS)).toBe('upNext');
    expect(slideAt(slides, 39, DEFAULT_DWELL_SECONDS)).toBe('upNext');
  });

  it('wraps, so a board left running for a week cannot drift off the end', () => {
    const week = 7 * 24 * 60 * 60;
    expect(slideAt(slides, week + 20, DEFAULT_DWELL_SECONDS)).toBe(
      slideAt(slides, 20, DEFAULT_DWELL_SECONDS),
    );
  });

  it('stays on courts when courts is the only slide', () => {
    expect(slideAt(['courts'], 999, DEFAULT_DWELL_SECONDS)).toBe('courts');
  });
});
