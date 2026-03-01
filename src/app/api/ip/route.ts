import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  // Vercel sets x-forwarded-for; fallback chain for other environments
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  return NextResponse.json({ ip });
}
