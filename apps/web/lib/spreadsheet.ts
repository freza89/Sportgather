'use client';

import Papa from 'papaparse';

export interface SheetTable {
  headers: string[];
  rows: string[][];
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    // Sel tanggal Excel → ISO (YYYY-MM-DD), tanpa geser zona waktu.
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).trim();
}

/** Baca .xlsx atau .csv di browser (data tidak dikirim sebelum dipetakan & diperiksa). */
export async function readSpreadsheet(file: File): Promise<SheetTable> {
  let matrix: unknown[][];
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    matrix = Papa.parse<string[]>(text, { skipEmptyLines: true }).data;
  } else if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    matrix = (await readSheet(file)) as unknown[][];
  } else {
    throw new Error('Format file harus .xlsx atau .csv');
  }
  const [head = [], ...body] = matrix;
  const headers = head.map((h, i) => cellToString(h) || `Kolom ${i + 1}`);
  const rows = body
    .map((r) => headers.map((_, i) => cellToString(r[i])))
    .filter((r) => r.some((c) => c !== ''));
  return { headers, rows };
}
