/**
 * Normalisasi nomor WhatsApp Indonesia ke E.164 (+62…).
 * Menerima "0812-3456-7890", "62812…", "+62 812…", "812…".
 * Mengembalikan null bila bukan nomor seluler Indonesia yang valid.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  let national: string;
  if (digits.startsWith('+62')) national = digits.slice(3);
  else if (digits.startsWith('62')) national = digits.slice(2);
  else if (digits.startsWith('0')) national = digits.slice(1);
  else if (digits.startsWith('8')) national = digits;
  else return null;
  // Nomor seluler Indonesia: 8xx, total 9–12 digit setelah kode negara.
  if (!/^8\d{8,11}$/.test(national)) return null;
  return `+62${national}`;
}

/** Tampilan nomor sesuai desain: +6281234567890 → 0812-3456-7890 */
export function formatPhone(e164: string): string {
  const national = e164.startsWith('+62') ? `0${e164.slice(3)}` : e164;
  return national.replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3');
}

/** Untuk log & audit: 0812-****-7890 */
export function maskPhone(e164: string): string {
  return formatPhone(e164).replace(/^(\d{4})-(\d{4})-/, '$1-****-');
}
