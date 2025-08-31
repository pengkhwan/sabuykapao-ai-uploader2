// apps/worker/app/api/ai/slug-generate/route.ts
import { NextRequest } from "next/server";
import { sanity } from "../../../../lib/sanity";
import { options204, withCorsJSON } from "../../../../lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const toPub = (id?: string) =>
  id && id.startsWith("drafts.") ? id.slice(7) : (id || "");

export function OPTIONS() {
  return options204();
}

/** ---------- helpers ---------- */
function slugify(v: string): string {
  return (v || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function fallbackBaseFromId(selfId: string): string {
  const cleaned = (selfId || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const tail = cleaned.slice(-6) || Math.random().toString(36).slice(2, 8);
  return `item-${tail}`; // always ascii + hyphen, ≤ 60 by construction
}

async function isConflict(slug: string, selfId: string) {
  const hit = await sanity.fetch(
    `*[defined(slug.current) && slug.current==$slug && !(_id in [$self, "drafts." + $self])][0]{_id}`,
    { slug, self: selfId || "__none__" }
  );
  return !!hit;
}

async function ensureUniqueSlug(base: string, selfId: string): Promise<string> {
  let slug = base || "item";
  let i = 2;
  while (await isConflict(slug, selfId)) {
    const suffix = `-${i++}`;
    slug = (base + suffix).slice(0, 60);
  }
  return slug;
}

async function generateAndApply(docId: string, name: string) {
  const pubId = toPub(docId);

  // เช็คว่ามีเอกสาร publish จริงไหม
  const exists = await sanity.fetch<number>(`count(*[_id==$id])`, { id: pubId });
  if (!exists) {
    return { status: 404, body: { ok: false, error: "Published document not found" } };
  }

  // 1) พยายามสร้างจาก name ตามปกติ
  let base = slugify(name);

  // 2) ถ้า name เป็นภาษาไทยหรือฟิลด์ไม่เหมาะ → fallback ด้วย id
  if (!base) {
    base = fallbackBaseFromId(pubId);
  }

  const unique = await ensureUniqueSlug(base, pubId);

  const res = await sanity
    .patch(pubId)
    .setIfMissing({ slug: { _type: "slug" } })
    .set({ "slug.current": unique })
    .commit();

  return { status: 200, body: { ok: true, slug: unique, resId: (res as any)?._id } };
}

/** ---------- GET: test-friendly ---------- */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const docId = url.searchParams.get("docId") || "";
    const name = url.searchParams.get("name") || "";
    if (!docId || !name) {
      return withCorsJSON({ ok: false, error: "Missing docId or name" }, 400);
    }
    const r = await generateAndApply(docId, name);
    return withCorsJSON(r.body, r.status);
  } catch (err: any) {
    return withCorsJSON({ ok: false, error: err?.message || String(err) }, 500);
  }
}

/** ---------- POST: JSON ---------- */
export async function POST(req: NextRequest) {
  try {
    const { docId, name } = (await req.json()) as { docId?: string; name?: string };
    if (!docId || !name) {
      return withCorsJSON({ ok: false, error: "Missing docId or name" }, 400);
    }
    const r = await generateAndApply(docId, name);
    return withCorsJSON(r.body, r.status);
  } catch (err: any) {
    return withCorsJSON({ ok: false, error: err?.message || String(err) }, 500);
  }
}
