/** Tanggal hari ini (WIB) sebagai ISO — acuan tampilan default. */
export function todayJakarta(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Item pertama yang belum selesai & tidak dibatalkan (dihitung saat request di server). */
export function nextUpcoming<T extends { status: string; endsAt: string }>(
  items: T[],
  now = new Date(),
): T | undefined {
  return items.find(
    (i) => i.status === 'scheduled' && new Date(i.endsAt).getTime() > now.getTime(),
  );
}
