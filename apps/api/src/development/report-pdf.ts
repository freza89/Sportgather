import { formatScore, formatTanggalIso, kuLabel, type ReportCardDto } from '@sportgather/shared';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const safe = (s: string) =>
  s
    .replace(/\u2212/g, '-')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E\u00A0-ÿ]/g, '?');

const BRAND = rgb(0.95, 0.42, 0.13);
const NAVY = rgb(0.06, 0.1, 0.23);
const MUTED = rgb(0.42, 0.42, 0.46);
const LINE = rgb(0.88, 0.89, 0.92);

/** Rapor semester A4 (DEV-03): kehadiran %, skor skill, catatan pelatih. */
export async function renderReportCard(r: ReportCardDto): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Rapor ${r.childName} - Semester ${r.semester} ${r.season.name}`);
  pdf.setProducer('SportGather');
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 780;
  const text = (s: string, x: number, size = 11, f = font, color = NAVY) =>
    page.drawText(safe(s), { x, y, size, font: f, color });

  // Kepala: inisial klub sebagai lencana (logo klub menyusul saat unggah logo tersedia).
  const initials = r.orgName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  page.drawCircle({ x: 68, y: y + 4, size: 22, color: BRAND });
  page.drawText(safe(initials), {
    x: 68 - bold.widthOfTextAtSize(initials, 14) / 2,
    y: y - 1,
    size: 14,
    font: bold,
    color: rgb(1, 1, 1),
  });
  text(r.orgName, 100, 16, bold);
  y -= 18;
  text(`Rapor perkembangan · Semester ${r.semester} · ${r.season.name}`, 100, 10, font, MUTED);
  y -= 40;

  text(r.childName, 48, 20, bold);
  y -= 18;
  text(
    [
      r.teamName,
      r.ku ? kuLabel(r.ku) : null,
      `${formatTanggalIso(r.range.from)} - ${formatTanggalIso(r.range.to)}`,
    ]
      .filter(Boolean)
      .join(' · '),
    48,
    10,
    font,
    MUTED,
  );
  y -= 40;

  // Kartu ringkasan
  const card = (x: number, label: string, value: string, sub: string) => {
    page.drawRectangle({ x, y: y - 50, width: 240, height: 72, borderColor: LINE, borderWidth: 1 });
    page.drawText(safe(label), { x: x + 14, y: y + 6, size: 9, font: bold, color: MUTED });
    page.drawText(safe(value), { x: x + 14, y: y - 20, size: 24, font: bold, color: NAVY });
    page.drawText(safe(sub), { x: x + 14, y: y - 38, size: 9, font, color: MUTED });
  };
  card(
    48,
    'KEHADIRAN',
    r.attendance.pct === null ? '-' : `${r.attendance.pct}%`,
    `${r.attendance.attended} dari ${r.attendance.total} sesi`,
  );
  card(
    307,
    'SKOR SKILL',
    r.average === null ? '-' : `${formatScore(r.average)}/5`,
    r.previousAverage === null
      ? 'rata-rata semua skill'
      : `semester lalu ${formatScore(r.previousAverage)}`,
  );
  y -= 100;

  text('Penilaian skill', 48, 13, bold);
  y -= 24;
  for (const s of r.skills) {
    text(s.name, 48, 11);
    for (let i = 0; i < 5; i++)
      page.drawRectangle({
        x: 260 + i * 46,
        y: y - 1,
        width: 40,
        height: 9,
        color: s.score !== null && i < s.score ? BRAND : LINE,
      });
    text(`${s.score ?? '-'}/5`, 500, 11, bold);
    y -= 24;
  }
  if (!r.skills.length) {
    text('Belum ada penilaian skill di semester ini.', 48, 10, font, MUTED);
    y -= 24;
  }
  y -= 16;
  if (r.note) {
    text(`Catatan ${r.note.coachName ?? 'pelatih'}`, 48, 13, bold);
    y -= 20;
    // Bungkus kata sederhana (lebar ±80 karakter).
    const words = safe(r.note.text).split(/\s+/);
    let line = '';
    for (const w of words) {
      if (font.widthOfTextAtSize(`${line} ${w}`, 11) > 495) {
        text(line.trim(), 48, 11);
        y -= 16;
        line = w;
      } else line = `${line} ${w}`;
    }
    if (line.trim()) text(line.trim(), 48, 11);
  }
  y = 48;
  text(
    `Diterbitkan ${formatTanggalIso(r.publishedAt.slice(0, 10), true)} · dibuat otomatis oleh SportGather`,
    48,
    8,
    font,
    MUTED,
  );
  return pdf.save();
}
