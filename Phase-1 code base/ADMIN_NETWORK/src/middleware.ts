import { NextResponse, type NextRequest } from "next/server";

// Pages need a session cookie; the API checks the session itself on every call.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api") || pathname === "/login") return NextResponse.next();
  if (!req.cookies.get("rv_admin") && !req.cookies.get("rv_desk")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|webp)).*)"] };
