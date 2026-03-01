import { NextRequest, NextResponse } from "next/server";

function countryCodeToFlag(code: string): string {
  const upper = code.toUpperCase();
  return String.fromCodePoint(...[...upper].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export async function GET(req: NextRequest) {
  const country = req.headers.get("x-vercel-ip-country") ?? req.geo?.country ?? "";
  const flag = country ? countryCodeToFlag(country) : "";
  return NextResponse.json({ country, flag });
}
