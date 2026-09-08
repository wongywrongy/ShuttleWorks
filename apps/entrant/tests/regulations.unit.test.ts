import { describe, expect, it } from 'vitest';

import { parseRegulationBlocks, parseRegulationSections } from '../app/routes/regulations';

describe('parseRegulationSections', () => {
  it('creates a stable outline from numbered headings', () => {
    expect(parseRegulationSections('1. Eligibility\nPlayers must qualify.\n\n2. Format\nBest of three.')).toEqual([
      {
        id: '1-eligibility',
        title: '1. Eligibility',
        blocks: [{ kind: 'paragraph', text: 'Players must qualify.' }],
      },
      {
        id: '2-format',
        title: '2. Format',
        blocks: [{ kind: 'paragraph', text: 'Best of three.' }],
      },
    ]);
  });

  it('keeps unstructured authored text as one section', () => {
    expect(parseRegulationSections('BWF laws apply.\nPlease arrive early.')).toEqual([
      {
        id: 'full-regulations',
        title: 'Full regulations',
        blocks: [{ kind: 'paragraph', text: 'BWF laws apply.\nPlease arrive early.' }],
      },
    ]);
  });

  it('disambiguates repeated headings for deep links', () => {
    const sections = parseRegulationSections('1. Rules\nFirst.\n\n1. Rules\nSecond.');
    expect(sections.map((section) => section.id)).toEqual(['1-rules', '1-rules-2']);
  });
});

// public-visual-fixes P6: a rules document is paragraphs AND lists. Before
// this the whole body was one pre-wrapped paragraph, so an organizer's
// bulleted eligibility list printed as a wall of soft-wrapped lines.
describe('parseRegulationBlocks', () => {
  it('separates paragraphs on blank lines and keeps authored line breaks', () => {
    expect(parseRegulationBlocks('One.\nStill one.\n\nTwo.')).toEqual([
      { kind: 'paragraph', text: 'One.\nStill one.' },
      { kind: 'paragraph', text: 'Two.' },
    ]);
  });

  it('groups consecutive bullets into one list, in the order written', () => {
    expect(parseRegulationBlocks('Bring:\n- Shoes\n* Water\n• Shuttle\n\nThank you.')).toEqual([
      { kind: 'paragraph', text: 'Bring:' },
      { kind: 'list', items: ['Shoes', 'Water', 'Shuttle'] },
      { kind: 'paragraph', text: 'Thank you.' },
    ]);
  });

  it('leaves numbered lines to the heading parser rather than claiming them as list items', () => {
    expect(parseRegulationBlocks('1. Not a bullet')).toEqual([
      { kind: 'paragraph', text: '1. Not a bullet' },
    ]);
  });
});
