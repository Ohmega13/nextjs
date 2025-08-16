// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/signup', '/api', '/favicon.ico', '/robots.txt'];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // ผ่านได้ถ้าเป็นหน้า public หรือไฟล์ static/_next
  if (
    isPublic(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/)
  ) {
    return NextResponse.next();
  }

  // เช็คคุกกี้ auth ของ Supabase (ครอบคลุมชื่อที่พบบ่อย)
  const hasAuthCookie =
    req.cookies.has('sb-access-token') ||
    req.cookies.has('supabase-auth-token') ||
    [...req.cookies.getAll()].some((c) => c.name.includes('auth-token') && c.name.includes('sb-'));

  if (!hasAuthCookie) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = search ? `?returnTo=${encodeURIComponent(pathname + search)}` : `?returnTo=${pathname}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// ให้ middleware ทำงานทุกเส้นทาง ยกเว้นไฟล์ static บางอย่าง (ป้องกันโอเวอร์แมตช์)
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|assets).*)'],
};