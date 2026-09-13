// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initEntryWizard } from '../public/assets/entry-wizard.js';

function mount(initial = 'details', name = 'Ada Lovelace') {
  document.body.innerHTML = `<main><form action="/e/api/submit/spring-open" data-entry-wizard data-entry-initial-stage="${initial}">
    <section data-entry-stage="details"><h2>Entry details</h2><div data-entry-player-block>
      <input name="playerName" required><select name="gender"><option value="F">F</option></select>
      <label><input type="checkbox" name="events" value="0:ms" checked>Singles</label><label><input type="checkbox" name="events" value="0:xd">Doubles</label>
    </div></section>
    <section data-entry-stage="review"><h2>Review</h2><div data-entry-review-summary></div>
      <input name="reviewedQuote" value="server-reviewed-basket"><input name="acknowledged" type="checkbox" required>
      <p>Quoted total 25.00 TWD</p></section>
    <div data-entry-wizard-controls="details"><button type="button" data-wizard-next>Review</button></div>
    <div data-entry-wizard-controls="review"><button type="button" data-wizard-back>Back</button></div>
    <span data-entry-bar-quote><button type="submit" formaction="/e/api/quote/spring-open" formnovalidate>Update total</button></span>
    <span data-entry-bar-submit><button type="submit">Submit entry</button></span>
  </form></main>`;
  const root = document.querySelector<HTMLFormElement>('form')!;
  root.querySelector<HTMLInputElement>('[name="playerName"]')!.value = name;
  initEntryWizard(root);
  return root;
}

beforeEach(() => { document.body.innerHTML = ''; window.sessionStorage.clear(); });

describe('two-stage entry enhancement', () => {
  it('requests the server quote before review and leaves confirmation unsubmitted', () => {
    const root = mount();
    const submit = vi.spyOn(root, 'requestSubmit').mockImplementation(() => {});
    root.querySelector<HTMLButtonElement>('[data-wizard-next]')!.click();
    expect(submit).toHaveBeenCalledWith(root.querySelector('[data-entry-bar-quote] button'));
    expect(root.dataset.entryStage).toBe('details');
    expect(root.querySelector<HTMLElement>('[data-entry-stage="review"]')!.hidden).toBe(true);
  });

  it('shows the returned reviewed quote, then returns focus to editable details', () => {
    const root = mount('review');
    expect(root.querySelector<HTMLElement>('[data-entry-stage="review"]')!.hidden).toBe(false);
    expect(root.textContent).toContain('25.00 TWD');
    expect(root.querySelector<HTMLInputElement>('[name="acknowledged"]')!.checked).toBe(false);
    root.querySelector<HTMLButtonElement>('[data-wizard-back]')!.click();
    expect(root.dataset.entryStage).toBe('details');
    expect(document.activeElement?.textContent).toBe('Entry details');
    expect(root.querySelector<HTMLInputElement>('[name="playerName"]')!.value).toBe('Ada Lovelace');
  });

  it('preserves draft input and renders names as text without storing server credentials', () => {
    const root = mount('review', '<img src=x onerror=alert(1)>');
    root.querySelector<HTMLInputElement>('[name="playerName"]')!.dispatchEvent(new Event('change', { bubbles: true }));
    const summary = root.querySelector<HTMLElement>('[data-entry-review-summary]')!;
    expect(summary.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(summary.querySelector('img')).toBeNull();
    const draft = window.sessionStorage.getItem('shuttleworks:entry-draft:spring-open') ?? '';
    expect(draft).toContain('onerror');
    expect(draft).not.toContain('server-reviewed-basket');
  });
  it('offers a newer local draft over an older posted echo without restoring consent or a quote', () => {
    window.sessionStorage.setItem('shuttleworks:entry-draft:spring-open', JSON.stringify({
      playerName: ['Offline edit'], gender: ['F'], events: ['0:ms'], acknowledged: ['on'],
    }));
    const root = mount('review', 'Older posted name');
    expect(root.querySelector<HTMLInputElement>('[name="playerName"]')!.value).toBe('Older posted name');
    const restore = [...document.querySelectorAll('button')].find(button => button.textContent === 'Restore saved draft')!;
    restore.click();
    expect(root.querySelector<HTMLInputElement>('[name="playerName"]')!.value).toBe('Offline edit');
    expect(root.dataset.entryStage).toBe('details');
    expect(root.querySelector<HTMLInputElement>('[name="reviewedQuote"]')!.value).toBe('');
    expect(root.querySelector<HTMLInputElement>('[name="acknowledged"]')!.checked).toBe(false);
  });

  it.each([['0:xd'], []])('round-trips the actual event selection %j without expanding the basket', (...selected) => {
    const selectedEvents = selected.filter(value => typeof value === 'string');
    const first = mount();
    for (const field of first.querySelectorAll<HTMLInputElement>('[name="events"]')) field.checked = selectedEvents.includes(field.value);
    first.dispatchEvent(new Event('change', { bubbles: true }));
    const saved = JSON.parse(window.sessionStorage.getItem('shuttleworks:entry-draft:spring-open')!);
    expect(saved.events ?? []).toEqual(selectedEvents);
    const reloaded = mount('review');
    [...document.querySelectorAll('button')].find(button => button.textContent === 'Restore saved draft')!.click();
    expect([...reloaded.querySelectorAll<HTMLInputElement>('[name="events"]:checked')].map(field => field.value)).toEqual(selectedEvents);
    expect(reloaded.querySelector<HTMLInputElement>('[name="reviewedQuote"]')!.value).toBe('');
  });

});
