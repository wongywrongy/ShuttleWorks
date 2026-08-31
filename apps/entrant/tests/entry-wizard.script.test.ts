// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { initEntryWizard } from '../public/assets/entry-wizard.js';

function mount(withPartner = true) {
  document.body.innerHTML = `
    <main>
      <section data-entry-wizard-panel="eligibility"></section>
      <section data-entry-wizard-panel="account"></section>
      <form action="/e/api/submit/spring-open" data-entry-wizard>
        <section data-entry-section="participant">
          <input name="playerName" required value="Ada Lovelace">
          <select name="gender"><option value="F" selected>F</option></select>
        </section>
        <section data-entry-section="events">
          <label><input type="checkbox" name="events" value="0:ms" checked>Men's Singles</label>
        </section>
        ${withPartner ? '<div data-entry-section="partner"><input name="partner:0:wd" value="sam@example.test"></div>' : ''}
        <section data-entry-wizard-panel="review"><div data-entry-review-summary><p>placeholder</p></div><input name="acknowledged" type="checkbox"></section>
        <div data-entry-wizard-controls="participant"></div>
        <div data-entry-wizard-controls="events"></div>
        <div data-entry-wizard-controls="partner"></div>
        <div data-entry-submit-bar></div>
      </form>
    </main>`;
  const root = document.querySelector<HTMLElement>('[data-entry-wizard]');
  initEntryWizard(root);
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.sessionStorage.clear();
});

describe('entry wizard enhancement', () => {
  it('starts with context and reveals a chapter at a time', () => {
    const root = mount();
    expect(document.querySelector<HTMLElement>('[data-entry-wizard-panel="eligibility"]')?.hidden).toBe(false);
    expect(root?.querySelector<HTMLElement>('[data-entry-section="participant"]')?.hidden).toBe(true);
    const next = document.querySelector<HTMLElement>('[data-wizard-next="eligibility"]');
    expect(next).not.toBeNull();
    next?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector<HTMLElement>('[data-entry-wizard-panel="account"]')?.hidden).toBe(false);
  });

  it('skips partner when the selected event set has no partner fields', () => {
    const root = mount(false);
    document.querySelector('[data-wizard-next="eligibility"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.querySelector('[data-wizard-next="account"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(root?.querySelector<HTMLElement>('[data-entry-wizard-controls="partner"]')?.hidden).toBe(true);
    expect(root?.querySelector<HTMLElement>('[data-entry-submit-bar]')?.hidden).toBe(true);
  });

  it('persists entered fields and builds a text-only review summary', () => {
    const root = mount();
    root?.querySelector<HTMLInputElement>('input[name="playerName"]')?.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('[data-wizard-next="eligibility"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.querySelector('[data-wizard-next="account"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    root?.querySelector('[data-wizard-next="participant"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    root?.querySelector('[data-wizard-next="events"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    root?.querySelector('[data-wizard-next="partner"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(root?.querySelector<HTMLElement>('[data-entry-review-summary]')?.textContent).toContain('Ada Lovelace');
    expect(window.sessionStorage.getItem('shuttleworks:entry-draft:spring-open') ?? '').toContain('Ada Lovelace');
    expect(root?.querySelector<HTMLAnchorElement>('[data-entry-review-summary] a')?.textContent ?? '').toContain('Edit participant');
  });
});
