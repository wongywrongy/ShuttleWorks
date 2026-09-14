import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachmentFilename, saveBlob } from '../fileDownload';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('file downloads', () => {
  it.each([
    ['attachment; filename="bracket_t1.csv"', 'bracket_t1.csv'],
    ["attachment; filename*=UTF-8''draw%20export.ics", 'draw export.ics'],
    ['attachment; filename="../../etc/passwd"', '.._.._etc_passwd'],
    [undefined, 'fallback.json'],
    ['inline', 'fallback.json'],
  ])('names %s as %s', (disposition, expected) => {
    expect(attachmentFilename(disposition, 'fallback.json')).toBe(expected);
  });

  it('hands the blob to the browser and leaves no anchor or object URL behind', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:export'), revokeObjectURL });
    saveBlob('bracket.csv', new Blob(['a,b']));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:export');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
