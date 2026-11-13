import { NextRequest, NextResponse } from "next/server";
import { updateStaffSession } from "@/lib/supabase/middleware";

function allowedOrigins() {
  const apps = process.env.MOBILE_WEB_ORIGINS || "http://localhost:8081,http://localhost:8082";
  const desk = process.env.ADMIN_WEB_ORIGINS || "http://localhost:3003";
  return `${apps},${desk}`
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function withCors(response: NextResponse, origin: string | null) {
  if (origin && allowedOrigins().includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Checkout-Token");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    response.headers.set("Access-Control-Max-Age", "600");
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/v1/")) {
    const origin = request.headers.get("origin");
    if (request.method === "OPTIONS") return withCors(new NextResponse(null, { status: 204 }), origin);
    return withCors(NextResponse.next(), origin);
  }
  if (path.startsWith("/admin")) {
    return updateStaffSession(request);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/v1/:path*"],
};
