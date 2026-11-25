import { formatRupiah, PAYMENT_METHODS } from '@sportgather/shared';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface ReceiptData {
  orgName: string;
  orgCity: string;
  invoiceNumber: string;
  childName: string;
  description: string;
  amount: number;
  discount: number;
  total: number;
  method: string;
  paidAt: Date;
  reference: string | null;
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'Tunai',
  transfer: 'Transfer bank',
  ...Object.fromEntries(Object.entries(PAYMENT_METHODS).map(([k, v]) => [k, v.label])),
};

/** Font standar PDF (WinAnsi) tidak punya "−" (U+2212); ganti ke tanda minus ASCII. */
const safe = (s: string) => s.replace(/−/g, '-').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');

/** Kuitansi A5 sederhana (FEE-06). */
export async function renderReceipt(r: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Kuitansi ${r.invoiceNumber}`);
  pdf.setProducer('SportGather');
  const page = pdf.addPage([420, 595]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.42, 0.42, 0.46);
  let y = 545;
  const text = (s: string, x: number, size = 10, f = font, color = ink) =>
    page.drawText(safe(s), { x, y, size, font: f, color });
  const right = (s: string, size = 10, f = font) =>
    page.drawText(safe(s), {
      x: 380 - f.widthOfTextAtSize(safe(s), size),
      y,
      size,
      font: f,
      color: ink,
    });

  text(r.orgName, 40, 16, bold);
  y -= 18;
  text(r.orgCity, 40, 10, font, muted);
  y -= 40;
  text('KUITANSI PEMBAYARAN', 40, 12, bold);
  y -= 16;
  text(`No. ${r.invoiceNumber}`, 40, 10, font, muted);
  y -= 30;

  const paidAt = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(r.paidAt);
  for (const [k, v] of [
    ['Pemain', r.childName],
    ['Untuk', r.description],
    ['Tanggal bayar', `${paidAt} WIB`],
    ['Metode', METHOD_LABEL[r.method] ?? r.method],
    ...(r.reference ? [['Referensi', r.reference]] : []),
  ] as [string, string][]) {
    text(k, 40, 10, font, muted);
    text(v, 140, 10);
    y -= 18;
  }
  y -= 12;
  page.drawLine({
    start: { x: 40, y: y + 8 },
    end: { x: 380, y: y + 8 },
    thickness: 0.5,
    color: muted,
  });
  y -= 10;
  text('Nominal', 40);
  right(formatRupiah(r.amount));
  y -= 18;
  if (r.discount) {
    text('Beasiswa', 40);
    right(formatRupiah(-r.discount));
    y -= 18;
  }
  text('Total dibayar', 40, 11, bold);
  right(formatRupiah(r.total), 11, bold);
  y -= 26;
  text('LUNAS', 40, 14, bold, rgb(0.05, 0.55, 0.3));
  y = 60;
  text(
    'Kuitansi ini dibuat otomatis oleh SportGather dan sah tanpa tanda tangan.',
    40,
    8,
    font,
    muted,
  );
  return pdf.save();
}
