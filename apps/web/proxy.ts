import { NextResponse, type NextRequest } from 'next/server';

/**
 * Pemeriksaan optimistis: halaman yang butuh login diarahkan ke /masuk bila cookie sesi
 * tidak ada. Validasi sesi & hak akses sesungguhnya tetap di API (lihat lib/api-server.ts).
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has('sg_session')) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/masuk';
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/admin/:path*', '/pelatih/:path*', '/wali/:path*', '/pilih-klub'],
};
