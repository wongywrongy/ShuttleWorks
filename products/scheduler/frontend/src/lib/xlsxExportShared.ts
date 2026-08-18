/**
 * Shared XLSX export plumbing, used by the meet roster/matches exports and
 * the Operations schedule export (split at SP-CONSOLE-4 B4 so Operations
 * does not import a meet internal for a generic download helper).
 */
import type ExcelJSNs from 'exceljs';

export function sideNames(ids: string[] | undefined, playerById: Map<string, { name: string }>): string {
  if (!ids || ids.length === 0) return '';
  return ids.map((id) => playerById.get(id)?.name ?? id).join(' & ');
}

export function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function downloadXlsx(filename: string, workbook: ExcelJSNs.Workbook): Promise<void> {
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

/** Apply a fill + thin cell borders to every cell in a rectangle, optionally
 * ending with a thick black bottom rule so time groups stand apart. */
export function applyRangeStyle(
  sheet: ExcelJSNs.Worksheet,
  r1: number,
  r2: number,
  c1: number,
  c2: number,
  opts: { fill?: string; thickBottom?: boolean },
): void {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = sheet.getRow(r).getCell(c);
      if (opts.fill) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: opts.fill },
        };
      }
      const isBottom = r === r2 && opts.thickBottom;
      cell.border = {
        top:    cell.border?.top    ?? { style: 'thin', color: { argb: 'FFBFBFBF' } },
        bottom: isBottom
          ? { style: 'thick', color: { argb: 'FF000000' } }
          : (cell.border?.bottom ?? { style: 'thin', color: { argb: 'FFBFBFBF' } }),
        left:   cell.border?.left   ?? { style: 'thin', color: { argb: 'FFBFBFBF' } },
        right:  cell.border?.right  ?? { style: 'thin', color: { argb: 'FFBFBFBF' } },
      };
    }
  }
}
