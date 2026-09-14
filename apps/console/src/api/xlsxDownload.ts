/** Operator downloads require a fresh server-authenticated session. */
import type ExcelJSNs from 'exceljs';
import { apiClient } from './client';
import { saveBlob } from './fileDownload';
import { isFreshProofCancelled } from './sessionRestore';

/** Resolves false, with nothing written, when the operator cancels the
 *  verification the stale session asked for. */
export async function downloadXlsx(filename: string, workbook: ExcelJSNs.Workbook): Promise<boolean> {
  try {
    await apiClient.requireFreshAuthentication();
  } catch (error) {
    if (isFreshProofCancelled(error)) return false;
    throw error;
  }
  const buffer = await workbook.xlsx.writeBuffer();
  saveBlob(filename, new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  return true;
}
