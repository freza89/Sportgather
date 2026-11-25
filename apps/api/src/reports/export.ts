import { formatRupiah, PAYMENT_METHODS, type ReportKind } from '@sportgather/shared';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import writeExcelFile from 'write-excel-file/node';
import type { Period, Summary } from './reports.service.js';

export type Cell = string | number | null;
export interface Table {
  title: string;
  columns: { header: string; money?: boolean; width?: number }[];
  rows: Cell[][];
  footer?: Cell[];
}

export const REPORT_TITLES: Record<ReportKind, string> = {
  receivables: 'Piutang iuran',
  revenue: 'Pendapatan per KU',
  attendance: 'Kehadiran',
  payouts: 'Penyaluran dana',
};

const methodLabel = (m: string) =>
  ({ cash: 'Tunai', transfer: 'Transfer' })[m] ??
  PAYMENT_METHODS[m as keyof typeof PAYMENT_METHODS]?.label ??
  m;

/** Ringkasan yang SAMA dengan dashboard (US-18), disertakan di setiap ekspor. */
export function summaryTable(s: Summary): Table {
  return {
    title: 'Ringkasan',
    columns: [
      { header: 'Metrik', width: 36 },
      { header: 'Nilai', width: 24 },
    ],
    rows: [
      ['Periode', `${s.period.label} (${s.period.from} s.d. ${s.period.to})`],
      ['Pemain aktif', s.activePlayers],
      ['Pemain baru di periode', s.newPlayers],
      [
        'Kehadiran',
        s.attendance.pct === null
          ? '-'
          : `${s.attendance.pct}% (${s.attendance.hadir}/${s.attendance.total})`,
      ],
      ['Iuran tertagih (terbit di periode)', s.billing.billed],
      ['Iuran terbayar', s.billing.paid],
      ['Persentase terbayar', `${s.billing.pct}%`],
      ['Tagihan terlambat (per akhir periode)', s.overdue.count],
      ['Nominal terlambat', s.overdue.amount],
    ],
  };
}

export function toTables(kind: ReportKind, data: unknown): Table[] {
  switch (kind) {
    case 'receivables': {
      const rows = data as {
        number: string;
        player: string;
        team: string | null;
        description: string;
        dueDate: string;
        overdueDays: number;
        total: number;
        guardian: string | null;
        phone: string | null;
      }[];
      return [
        {
          title: 'Piutang',
          columns: [
            { header: 'No. tagihan', width: 16 },
            { header: 'Pemain', width: 24 },
            { header: 'Tim', width: 18 },
            { header: 'Untuk', width: 24 },
            { header: 'Jatuh tempo', width: 12 },
            { header: 'Terlambat (hari)', width: 10 },
            { header: 'Jumlah', money: true, width: 14 },
            { header: 'Wali', width: 20 },
            { header: 'WhatsApp', width: 16 },
          ],
          rows: rows.map((r) => [
            r.number,
            r.player,
            r.team,
            r.description,
            r.dueDate,
            r.overdueDays,
            r.total,
            r.guardian,
            r.phone,
          ]),
          footer: [
            'Total',
            null,
            null,
            null,
            null,
            null,
            rows.reduce((a, r) => a + r.total, 0),
            null,
            null,
          ],
        },
      ];
    }
    case 'revenue': {
      const d = data as {
        months: string[];
        rows: { label: string; perMonth: number[]; total: number }[];
        totals: number[];
        grandTotal: number;
      };
      return [
        {
          title: 'Pendapatan',
          columns: [
            { header: 'KU', width: 12 },
            ...d.months.map((m) => ({ header: m, money: true, width: 14 })),
            { header: 'Total', money: true, width: 16 },
          ],
          rows: d.rows.map((r) => [r.label, ...r.perMonth, r.total]),
          footer: ['Total', ...d.totals, d.grandTotal],
        },
      ];
    }
    case 'attendance': {
      const rows = data as {
        team: string;
        sessions: number;
        hadir: number;
        izin: number;
        sakit: number;
        alpa: number;
        pct: number | null;
      }[];
      return [
        {
          title: 'Kehadiran',
          columns: [
            { header: 'Tim', width: 24 },
            { header: 'Sesi', width: 8 },
            { header: 'Hadir', width: 8 },
            { header: 'Izin', width: 8 },
            { header: 'Sakit', width: 8 },
            { header: 'Alpa', width: 8 },
            { header: 'Kehadiran %', width: 12 },
          ],
          rows: rows.map((r) => [
            r.team,
            r.sessions,
            r.hadir,
            r.izin,
            r.sakit,
            r.alpa,
            r.pct === null ? '-' : `${r.pct}%`,
          ]),
        },
      ];
    }
    case 'payouts': {
      const d = data as {
        incoming: {
          paidAt: string;
          method: string;
          invoices: number;
          gross: number;
          midtransFee: number;
          platformFee: number;
          clubNet: number;
        }[];
        withdrawals: { at: string; amount: number; fee: number; net: number; status: string }[];
      };
      const sum = (k: 'gross' | 'midtransFee' | 'platformFee' | 'clubNet') =>
        d.incoming.reduce((a, r) => a + r[k], 0);
      return [
        {
          title: 'Pembayaran online',
          columns: [
            { header: 'Tanggal bayar', width: 18 },
            { header: 'Metode', width: 18 },
            { header: 'Tagihan', width: 8 },
            { header: 'Bruto', money: true, width: 14 },
            { header: 'Biaya Midtrans', money: true, width: 14 },
            { header: 'Fee platform', money: true, width: 14 },
            { header: 'Diterima klub', money: true, width: 14 },
          ],
          rows: d.incoming.map((r) => [
            r.paidAt.slice(0, 16).replace('T', ' '),
            methodLabel(r.method),
            r.invoices,
            r.gross,
            r.midtransFee,
            r.platformFee,
            r.clubNet,
          ]),
          footer: [
            'Total',
            null,
            null,
            sum('gross'),
            sum('midtransFee'),
            sum('platformFee'),
            sum('clubNet'),
          ],
        },
        {
          title: 'Penarikan',
          columns: [
            { header: 'Tanggal', width: 18 },
            { header: 'Nominal', money: true, width: 14 },
            { header: 'Biaya transfer', money: true, width: 14 },
            { header: 'Diterima rekening', money: true, width: 16 },
            { header: 'Status', width: 12 },
          ],
          rows: d.withdrawals.map((w) => [
            w.at.slice(0, 16).replace('T', ' '),
            w.amount,
            w.fee,
            w.net,
            w.status,
          ]),
        },
      ];
    }
  }
}

export async function toXlsx(tables: Table[]): Promise<Buffer> {
  const sheets = tables.map((t) => {
    const header = t.columns.map((c) => ({ value: c.header, fontWeight: 'bold' as const }));
    const body = [...t.rows, ...(t.footer ? [t.footer] : [])].map((row, ri) =>
      row.map((v, i) => {
        const bold = t.footer && ri === t.rows.length ? ('bold' as const) : undefined;
        if (typeof v === 'number')
          return {
            value: v,
            type: Number,
            ...(t.columns[i]?.money ? { format: '#,##0' } : {}),
            ...(bold ? { fontWeight: bold } : {}),
          };
        return { value: v ?? '', type: String, ...(bold ? { fontWeight: bold } : {}) };
      }),
    );
    return {
      data: [header, ...body],
      columns: t.columns.map((c) => ({ width: c.width ?? 14 })),
      sheet: t.title.slice(0, 31),
    };
  });
  // Satu workbook, satu sheet per tabel.
  return writeExcelFile(sheets as never).toBuffer();
}

const safe = (s: string) =>
  s
    .replace(/\u2212/g, '-')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E\u00A0-ÿ]/g, '?');

/** PDF A4 landscape sederhana: tabel bergaris dengan halaman bersambung. */
export async function toPdf(
  orgName: string,
  title: string,
  period: Period,
  tables: Table[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${title} - ${orgName}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 842;
  const H = 595;
  let page = pdf.addPage([W, H]);
  let y = H - 48;
  const draw = (s: string, x: number, size: number, f: PDFFont, color = rgb(0.06, 0.1, 0.23)) =>
    page.drawText(safe(s), { x, y, size, font: f, color });
  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - 48;
  };
  draw(orgName, 40, 10, font, rgb(0.42, 0.42, 0.46));
  y -= 20;
  draw(`${title} · ${period.label}`, 40, 16, bold);
  y -= 16;
  draw(
    `${period.from} s.d. ${period.to} · dibuat ${new Date().toISOString().slice(0, 10)}`,
    40,
    9,
    font,
    rgb(0.42, 0.42, 0.46),
  );
  y -= 28;
  for (const t of tables) {
    if (y < 120) newPage();
    draw(t.title, 40, 12, bold);
    y -= 20;
    const total = t.columns.reduce((a, c) => a + (c.width ?? 14), 0);
    const widths = t.columns.map((c) => ((c.width ?? 14) / total) * (W - 80));
    const xs = widths.map((_, i) => 40 + widths.slice(0, i).reduce((a, b) => a + b, 0));
    const row = (cells: Cell[], f: PDFFont) => {
      if (y < 40) newPage();
      cells.forEach((v, i) => {
        const money = t.columns[i]?.money && typeof v === 'number';
        let s = v === null ? '' : money ? formatRupiah(v as number) : String(v);
        // Potong teks yang terlalu panjang (font standar PDF tidak punya karakter elipsis).
        while (s.length > 1 && f.widthOfTextAtSize(safe(s), 8) > widths[i]! - 6)
          s = s.slice(0, -2) + '.';
        const tw = f.widthOfTextAtSize(safe(s), 8);
        draw(s, money || typeof v === 'number' ? xs[i]! + widths[i]! - 4 - tw : xs[i]! + 2, 8, f);
      });
      page.drawLine({
        start: { x: 40, y: y - 4 },
        end: { x: W - 40, y: y - 4 },
        thickness: 0.3,
        color: rgb(0.85, 0.86, 0.9),
      });
      y -= 15;
    };
    row(
      t.columns.map((c) => c.header),
      bold,
    );
    for (const r of t.rows) row(r, font);
    if (t.footer) row(t.footer, bold);
    if (!t.rows.length) {
      draw('Tidak ada data di periode ini.', 42, 8, font, rgb(0.42, 0.42, 0.46));
      y -= 15;
    }
    y -= 16;
  }
  return pdf.save();
}
