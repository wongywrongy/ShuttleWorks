import { readFileSync } from 'node:fs';

// Stable route labels, not fixture IDs or array positions. New routes are never
// dropped: they follow the known workflow until assigned a position here.
export const surfaceBookProfile = JSON.parse(readFileSync(new URL('./surface-book-profile.json', import.meta.url), 'utf8'));

export function bookMode(value = 'review') {
  if (!['review', 'full'].includes(value)) throw new Error('SURFACE_BOOK_MODE must be review or full');
  return value;
}

export function orderedSurfaces(tier, cards) {
  const order = new Map(surfaceBookProfile[tier].map((entry, index) => [entry.label, index]));
  return [...cards].sort((a, b) => (order.get(a.label) ?? Infinity) - (order.get(b.label) ?? Infinity));
}

export function selectedExamples(tier, surfaces) {
  return surfaceBookProfile[tier].flatMap(entry => {
    const path = surfaces.find(([label]) => label === entry.label)?.[1];
    return path ? (entry.examples ?? []).map(example => ({ ...example, path, label: entry.label })) : [];
  });
}

export function renderOrderedPages({ tier, cards, pages, interactions, renderPage, renderInteractions, includeInteractions = true }) {
  const output = [];
  for (const card of orderedSurfaces(tier, cards)) {
    const entry = surfaceBookProfile[tier].find(entry => entry.label === card.label);
    for (const viewport of entry?.mobile ? ['desktop', 'mobile'] : ['desktop']) {
      const page = pages.find(page => page.card === card && page.viewport === viewport && page.kind === 'document' && page.segment === 0);
      if (!page) throw new Error(`Missing page overview: ${card.label} (${viewport})`);
      output.push(renderPage(page));
    }
    if (!includeInteractions) continue;
    for (const example of entry?.examples ?? []) {
      const record = interactions.find(record => record.name === example.name && record.viewport === example.viewport);
      if (!record) throw new Error(`Missing selected interaction: ${example.name} (${example.viewport})`);
      const frames = record.frames.filter(frame => frame.caption !== 'Before action' && !frame.caption.includes('panel continuation'));
      output.push(renderInteractions([{ ...record, ref: `${card.ref}-${record.ref}`, frames }]));
    }
  }
  return output.join('');
}
