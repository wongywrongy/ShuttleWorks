import type ExcelJS from 'exceljs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../client';
import { downloadXlsx } from '../xlsxDownload';

vi.mock('../client', () => ({ apiClient: { requireFreshAuthentication: vi.fn() } }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('operator spreadsheet download', () => {
  it('refuses serialization and download when the server requires authentication', async () => {
    const writeBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    vi.mocked(apiClient.requireFreshAuthentication).mockRejectedValue(new Error('Reauthenticate'));
    await expect(downloadXlsx('roster.xlsx', { xlsx: { writeBuffer } } as unknown as ExcelJS.Workbook))
      .rejects.toThrow('Reauthenticate');
    expect(writeBuffer).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it('downloads only after the server accepts fresh authentication', async () => {
    const writeBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createObjectURL = vi.fn().mockReturnValue('blob:verified');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    let accept!: () => void;
    vi.mocked(apiClient.requireFreshAuthentication).mockReturnValue(new Promise(resolve => { accept = resolve; }));
    const pending = downloadXlsx('roster.xlsx', { xlsx: { writeBuffer } } as unknown as ExcelJS.Workbook);
    expect(writeBuffer).not.toHaveBeenCalled();
    accept();
    await pending;
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:verified');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
