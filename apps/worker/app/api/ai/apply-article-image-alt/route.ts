// apps/worker/app/api/ai/apply-article-image-alt/route.ts
import { NextRequest } from "next/server";
import { sanity } from "../../../../lib/sanity";
import { options204, withCorsJSON } from "../../../../lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS() {
  return options204();
}

type AltPreview = {
  featured?: { alt: string };
  body?: { items: Array<{ key: string; alt: string }> };
};

function toPub(id?: string) {
  return id && id.startsWith("drafts.") ? id.slice(7) : id || "";
}

/**
 * POST /api/ai/apply-article-image-alt
 * Body: { docId: string; dryRun?: boolean }
 * - อ่าน preview จาก aiPreview.result.imageAlts
 * - เขียน alt ลงฟิลด์จริง: featuredImage.alt และ body[_key=="..."].alt
 */
export async function POST(req: NextRequest) {
  try {
    const { docId: rawDocId, dryRun = false } = (await req.json()) as {
      docId?: string;
      dryRun?: boolean;
    };

    const docId = toPub(rawDocId);
    if (!docId) {
      return withCorsJSON({ ok: false, error: "Missing docId" }, 400);
    }

    // 1) อ่าน document + preview ALT
    const doc = (await sanity.getDocument(docId)) as any;
    const preview: AltPreview | null = doc?.aiPreview?.result?.imageAlts || null;

    if (!preview || (!preview.featured && !(preview.body?.items?.length > 0))) {
      return withCorsJSON(
        { ok: false, error: "No preview ALT found. Generate first." },
        404
      );
    }

    // 2) เตรียม setOps สำหรับ patch
    const setOps: Record<string, unknown> = {};

    // featured image
    if (preview.featured?.alt) {
      setOps["featuredImage.alt"] = preview.featured.alt;
    }

    // body images by _key
    const items = preview.body?.items || [];
    for (const it of items) {
      if (it?.key && it?.alt) {
        setOps[`body[_key=="${it.key}"].alt`] = it.alt;
      }
    }

    if (Object.keys(setOps).length === 0) {
      return withCorsJSON(
        { ok: false, error: "Nothing to apply (no alt strings)." },
        400
      );
    }

    // 3) โหมด dry-run: แสดงว่าจะเขียนอะไร โดยไม่ commit
    if (dryRun) {
      return withCorsJSON({
        ok: true,
        dryRun: true,
        setOps,
        counts: {
          featured: preview.featured?.alt ? 1 : 0,
          body: items.length,
        },
        docId,
      });
    }

    // 4) Commit ลง Sanity
    const res = await sanity
      .patch(docId)
      .set(setOps)
      .commit({ autoGenerateArrayKeys: true, returnIds: true });

    return withCorsJSON(
      {
        ok: true,
        applied: {
          featured: preview.featured?.alt ? 1 : 0,
          body: items.length,
        },
        transaction: (res as any)?.transactionId || null,
        docId,
      },
      200
    );
  } catch (err: any) {
    return withCorsJSON(
      { ok: false, error: err?.message || String(err) },
      500
    );
  }
}
