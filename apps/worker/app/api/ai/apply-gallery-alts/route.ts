// apps/worker/app/api/ai/apply-gallery-alts/route.ts
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

export async function POST(req: NextRequest) {
  try {
    const { docId } = (await req.json()) as { docId?: string };
    if (!docId) {
      return withCorsJSON({ ok: false, error: "Missing docId" }, 400);
    }

    const pubId = toPub(docId);

    // อ่านรายการรูปและผลจาก aiPreview
    const data = await sanity.fetch(
      `*[_id==$id][0]{
        "gallery": coalesce(gallery, [])[]{ _key },
        aiPreview
      }`,
      { id: pubId }
    );

    if (!data) {
      return withCorsJSON({ ok: false, error: "Document not found" }, 404);
    }

    const suggestions: Array<{ key: string; alt: string }> =
      data?.aiPreview?.result?.gallery || [];

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return withCorsJSON(
        {
          ok: false,
          error:
            "No gallery suggestions in aiPreview. Run gallery_alt_generate first.",
        },
        400
      );
    }

    // สร้าง mapping key -> alt แล้ว set ทีละรายการ
    const altByKey = new Map(suggestions.map((s) => [s.key, s.alt]));
    const sets: Record<string, string> = {};
    let appliedCount = 0;

    for (const g of data.gallery || []) {
      const alt = altByKey.get(g._key);
      if (alt) {
        sets[`gallery[_key=="${g._key}"].alt`] = alt;
        appliedCount++;
      }
    }

    if (appliedCount === 0) {
      return withCorsJSON(
        { ok: false, error: "No matching gallery items to apply." },
        400
      );
    }

    const res = await sanity.patch(pubId).set(sets).commit();

    return withCorsJSON({
      ok: true,
      resId: (res as any)?._id,
      appliedCount,
    });
  } catch (err: any) {
    return withCorsJSON(
      { ok: false, error: err?.message || String(err) },
      500
    );
  }
}
