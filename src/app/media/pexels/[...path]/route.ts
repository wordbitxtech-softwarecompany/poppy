import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 2592000;

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (path.length < 2 || path[0] !== "photos" || !/^\d+$/.test(path[1])) {
    return new NextResponse("Not found", { status: 404 });
  }

  const id = path[1];
  const file = path[2] ?? `pexels-photo-${id}.jpeg`;
  if (!/^pexels-photo-\d+\.jpe?g$/i.test(file)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const incoming = new URL(request.url);
  const query = new URLSearchParams({ auto: "compress", cs: "tinysrgb", fit: "crop" });
  const width = incoming.searchParams.get("w");
  const height = incoming.searchParams.get("h");
  if (width && /^\d{2,5}$/.test(width)) query.set("w", width);
  if (height && /^\d{2,5}$/.test(height)) query.set("h", height);

  const upstream = await fetch(`https://images.pexels.com/photos/${id}/${file}?${query.toString()}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PakProperty/1.0)" },
    next: { revalidate: 2592000 },
  });

  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
      "Cache-Control": "public, max-age=86400, s-maxage=2592000, immutable",
    },
  });
}
