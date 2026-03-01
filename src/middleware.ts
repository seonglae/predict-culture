import { NextResponse, type NextRequest } from "next/server";

/**
 * Set geo cookies from Vercel's edge headers so client-side code can read them.
 * In Next.js 16+, request.geo was removed. Vercel sets these headers at the edge:
 *   x-vercel-ip-city, x-vercel-ip-country
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const country = request.headers.get("x-vercel-ip-country") || "";

  response.cookies.set("_geo_country", country, { path: "/", maxAge: 3600 });

  return response;
}

export const config = {
  matcher: ["/"],
};
