import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic redirect for signed-out visitors. This only checks that a session cookie exists;
 * real authentication and authorization happen server-side in requireUser() on every request.
 */
export function proxy(request: NextRequest) {
  const hasSession = !!getSessionCookie(request);
  const { pathname } = request.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/register";
  if (!hasSession && !isAuthPage) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (hasSession && isAuthPage) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|webp|ico)$).*)"],
};
