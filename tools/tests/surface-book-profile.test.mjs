import test from 'node:test';
import assert from 'node:assert/strict';
import { bookMode, orderedSurfaces, selectedExamples, renderOrderedPages } from '../surface-book-profile.mjs';
import { interactionSections } from '../surface-interactions.mjs';

test('review is the default and misspelled modes fail', () => {
  assert.equal(bookMode(), 'review');
  assert.equal(bookMode('full'), 'full');
  assert.throws(() => bookMode('ful'), /must be review or full/);
});

test('workflow order retains unknown routes and optional example owners may be absent', () => {
  const cards = ['New page', 'Overview', 'Global settings · Sessions', 'Hub — workspace list', 'Another new page'].map(label => ({ label }));
  assert.deepEqual(orderedSurfaces('console', cards).map(c => c.label), ['Hub — workspace list', 'Global settings · Sessions', 'Overview', 'New page', 'Another new page']);
  assert.deepEqual(selectedExamples('console', []), []);
  assert.equal(selectedExamples('console', [['Hub — workspace list', '/']]).length, 3);
});

test('each page leads its selected examples; frame order survives and duplicates do not', () => {
  const cards = [{ label: 'Tournament · Overview', ref: 'S02' }, { label: 'Results draw · Singles full bracket', ref: 'S40' }, { label: 'New page', ref: 'S46' }];
  const pages = cards.flatMap(card => ['desktop', 'mobile'].flatMap(viewport => [0, 1].map(segment => ({ card, viewport, segment, kind: 'document' }))));
  const interactions = ['desktop', 'mobile'].map(viewport => ({ name: 'Player path and round selection', ref: 'I01', viewport, ok: true, frames: ['Before action', 'Enable path selection', 'Select player', 'Select player · panel continuation at 800px', 'Select final', 'Clear path'].map(caption => ({ caption, url: '/draw', assetPath: 'assets/frame.png' })) }));
  const args = { tier: 'entrant', cards, pages, interactions, renderPage: p => `<overview>${p.card.label}</overview>`, renderInteractions: records => interactionSections(records, String, { ordered: true }) };
  const html = renderOrderedPages(args);
  assert.equal((html.match(/<overview>/g) ?? []).length, 3);
  assert.equal((html.match(/<section /g) ?? []).length, 8);
  assert.doesNotMatch(html, /Before action|panel continuation/);
  assert.ok(html.indexOf('Results draw · Singles') < html.indexOf('Enable path selection'));
  assert.ok(html.lastIndexOf('Clear path') < html.indexOf('New page'));
  assert.ok(html.indexOf('Select player') < html.indexOf('Select final'));
  assert.match(html, /Step 4 of 4/);
  assert.throws(() => renderOrderedPages({ ...args, interactions: [] }), /Missing selected interaction/);
  assert.throws(() => renderOrderedPages({ ...args, pages: [] }), /Missing page overview/);
});
