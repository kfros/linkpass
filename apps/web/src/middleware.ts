import { NextResponse } from "next/server";

export function middleware(req: Request) {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/admin")) return NextResponse.next();

  const header = new Headers(req.headers).get("authorization") || "";
  const need = `Basic ${Buffer.from(`${process.env.ADMIN_USER}:${process.env.ADMIN_PASS}`).toString("base64")}`;
  if (header !== need) {
    return new NextResponse("Auth required", {
      status: 401,
      headers: { "WWW-Authenticate": "Basic realm=\"admin\"" }
    });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
