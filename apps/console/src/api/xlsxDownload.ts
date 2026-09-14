/** Operator downloads require a fresh server-authenticated session. */
import type ExcelJSNs from 'exceljs';
import { apiClient } from './client';

export async function downloadXlsx(filename: string, workbook: ExcelJSNs.Workbook): Promise<void> {
  await apiClient.requireFreshAuthentication();
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

