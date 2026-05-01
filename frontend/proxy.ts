import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Edge proxy (Next.js 16 — replaces the legacy `middleware.ts` file).
 * Currently a pass-through: token presence isn't checked here because JWTs
 * live in localStorage (not cookies), so role/expiry verification has to
 * happen client-side in the route group layouts.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/') return NextResponse.next();

  const publicPaths = [
    '/admin/login',
    '/protocol-admin/login',
    '/protocol-member/login',
    '/protocol/login',
    '/registration',
    '/offline.html',
  ];
  if (publicPaths.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
