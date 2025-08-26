import { NextRequest, NextResponse } from "next/server";
import { sanity } from "../../../../lib/sanity";

const ORIGIN = process.env.STUDIO_ORIGIN || "http://localhost:3333";
const toPub = (id: string) => (id && id.startsWith("drafts.") ? id.slice(7) : id);
const cors = (extra: Record<string, string> = {}) => ({
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  ...extra,
});

export async function OPTIONS() {
  return new NextResponse(null, { headers: cors() });
}

async function handle(req: NextRequest) {
  try {
    const url = new URL(req.url);
    let slug = (url.searchParams.get("slug") || "").trim();
    let id = url.searchParams.get("id") || "";

    if (!slug && req.method !== "GET") {
      try {
        const body: any = await req.json();
        slug = (body?.slug || "").trim();
        id = body?.id || id;
      } catch { /* ignore */ }
    }
    if (!slug) {
      return NextResponse.json(
        { ok: false, error: "Missing slug" },
        { status: 400, headers: cors({ "Content-Type": "application/json" }) }
      );
    }

    const pubId = id ? toPub(id) : "";

    // EN-only, kebab, ≤60
    const pattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!pattern.test(slug) || slug.length > 60) {
      return NextResponse.json(
        { ok: true, valid: false, conflict: false, reason: "format" },
        { headers: cors({ "Content-Type": "application/json" }) }
      );
    }

    // หาเอกสารที่ใช้ slug นี้อยู่ (ยกเว้นตัวเอง & draft ของตัวเอง)
    const hit = await sanity.fetch(
      `*[
        defined(slug.current) && slug.current==$slug &&
        !(_id in [$self, "drafts." + $self])
      ][0]{_id, _type, name, title}`,
      { slug, self: pubId || "__none__" }
    );

    const conflict = !!hit;

    return NextResponse.json(
      {
        ok: true,
        valid: true,
        conflict,
        hit: conflict ? hit : null,
      },
      { headers: cors({ "Content-Type": "application/json" }) }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500, headers: cors({ "Content-Type": "application/json" }) }
    );
  }
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
