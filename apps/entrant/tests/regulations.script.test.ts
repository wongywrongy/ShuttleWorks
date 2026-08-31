// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { boot, documentText } from '../public/assets/regulations.js';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('regulations document controls', () => {
  it('builds a plain text copy from the visible document', () => {
    document.body.innerHTML = `
      <div id="regulations-actions" data-document-title="Spring Open regulations"></div>
      <article id="regulations-document"><h2>Eligibility</h2><p>Players must be registered.</p></article>
    `;
    expect(documentText(document.getElementById('regulations-actions'))).toBe(
      'Spring Open regulations\n\nEligibilityPlayers must be registered.\n',
    );
  });

  it('connects print to the browser without changing the document', () => {
    document.body.innerHTML = `
      <div id="regulations-actions">
        <button data-regulations-print>Print</button>
        <button data-regulations-download>Download</button>
      </div>
    `;
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    boot(document.getElementById('regulations-actions'));
    document.querySelector('[data-regulations-print]')?.dispatchEvent(new Event('click'));
    expect(print).toHaveBeenCalledOnce();
  });
});
