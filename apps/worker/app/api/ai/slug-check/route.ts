// apps/worker/app/api/ai/slug-check/route.ts
import { NextRequest } from "next/server";
import { sanity } from "../../../../lib/sanity";
import { options204, withCorsJSON } from "../../../../lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const toPub = (id: string) =>
  id && id.startsWith("drafts.") ? id.slice(7) : id;

export function OPTIONS() {
  return options204();
}

async function handle(req: NextRequest) {
  try {
    const url = new URL(req.url);
    let slug = (url.searchParams.get("slug") || "").trim();
    let id = url.searchParams.get("id") || "";

    // รองรับส่งผ่าน body สำหรับ POST
    if (!slug && req.method !== "GET") {
      try {
        const body: any = await req.json();
        slug = (body?.slug || "").trim();
        id = body?.id || id;
      } catch {
        // ignore parse error
      }
    }

    if (!slug) {
      return withCorsJSON({ ok: false, error: "Missing slug" }, 400);
    }

    const pubId = id ? toPub(id) : "";

    // ตรวจรูปแบบ slug (อังกฤษล้วน, kebab-case, ความยาว ≤ 60)
    const pattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!pattern.test(slug) || slug.length > 60) {
      return withCorsJSON({ ok: true, valid: false, conflict: false, reason: "format" });
    }

    // หาเอกสารที่ใช้ slug นี้ (ยกเว้นตัวเองและ draft ของตัวเอง)
    const hit = await sanity.fetch(
      `*[
        defined(slug.current) && slug.current==$slug &&
        !(_id in [$self, "drafts." + $self])
      ][0]{_id, _type, name, title}`,
      { slug, self: pubId || "__none__" }
    );

    const conflict = !!hit;

    return withCorsJSON({
      ok: true,
      valid: true,
      conflict,
      hit: conflict ? hit : null,
    });
  } catch (err: any) {
    return withCorsJSON({ ok: false, error: err?.message || String(err) }, 500);
  }
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
