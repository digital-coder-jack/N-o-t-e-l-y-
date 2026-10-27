import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP_BY_HOP = [
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "host",
  "content-length", "accept-encoding"
];

async function proxy(request: NextRequest): Promise<Response> {
  const configured = (process.env.NOTELY_BACKEND_URL || "").trim().replace(/\/+$/, "");
  if (!configured) {
    return NextResponse.json({ detail: "backend_url_not_configured" }, { status: 503 });
  }

  let backend: URL;
  try {
    backend = new URL(configured);
    if (!["https:", "http:"].includes(backend.protocol) || backend.username || backend.password) {
      return NextResponse.json({ detail: "backend_url_invalid" }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ detail: "backend_url_invalid" }, { status: 503 });
  }

  try {
    const target = new URL(request.nextUrl.pathname + request.nextUrl.search, backend.origin);
    const headers = new Headers(request.headers);
    for (const name of HOP_BY_HOP) headers.delete(name);
    const init: RequestInit = {
      method: request.method,
      headers,
      redirect: "manual",
      cache: "no-store"
    };
    if (!["GET", "HEAD"].includes(request.method.toUpperCase())) {
      init.body = await request.arrayBuffer();
    }

    const upstream = await fetch(target, init);
    const responseHeaders = new Headers(upstream.headers);
    for (const name of HOP_BY_HOP) responseHeaders.delete(name);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    });
  } catch {
    return NextResponse.json({ detail: "backend_unavailable" }, { status: 502 });
  }
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
