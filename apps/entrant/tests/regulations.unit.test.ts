import { describe, expect, it } from 'vitest';

import { parseRegulationSections } from '../app/routes/regulations';

describe('parseRegulationSections', () => {
  it('creates a stable outline from numbered headings', () => {
    expect(parseRegulationSections('1. Eligibility\nPlayers must qualify.\n\n2. Format\nBest of three.')).toEqual([
      { id: '1-eligibility', title: '1. Eligibility', body: 'Players must qualify.' },
      { id: '2-format', title: '2. Format', body: 'Best of three.' },
    ]);
  });

  it('keeps unstructured authored text as one section', () => {
    expect(parseRegulationSections('BWF laws apply.\nPlease arrive early.')).toEqual([
      { id: 'full-regulations', title: 'Full regulations', body: 'BWF laws apply.\nPlease arrive early.' },
    ]);
  });

  it('disambiguates repeated headings for deep links', () => {
    const sections = parseRegulationSections('1. Rules\nFirst.\n\n1. Rules\nSecond.');
    expect(sections.map((section) => section.id)).toEqual(['1-rules', '1-rules-2']);
  });
});
