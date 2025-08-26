// apps/worker/app/api/ai/apply-short/route.ts
import { NextRequest } from "next/server";
import { sanity } from "../../../../lib/sanity";
import { options204, withCorsJSON } from "../../../../lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS() {
  return options204();
}

export async function POST(req: NextRequest) {
  try {
    const { docId } = (await req.json()) as { docId?: string };
    if (!docId) {
      return withCorsJSON({ ok: false, error: "Missing docId" }, 400);
    }

    // อ่านผลล่าสุดจาก aiPreview
    const doc = await sanity.fetch(`*[_id==$id][0]{ aiPreview }`, {
      id: docId,
    });

    const shortText: string | undefined =
      doc?.aiPreview?.result?.short_description;
    const metaText: string | undefined =
      doc?.aiPreview?.result?.meta_description;

    if (!shortText || !metaText) {
      return withCorsJSON(
        {
          ok: false,
          error: "No short/meta in aiPreview. Run short_generate first.",
        },
        400
      );
    }

    // เขียนกลับ: shortDescription และ seo.seoDescription
    const res = await sanity
      .patch(docId)
      .setIfMissing({ seo: { _type: "seo" } })
      .set({
        shortDescription: shortText,
        "seo.seoDescription": metaText,
      })
      .commit();

    return withCorsJSON({
      ok: true,
      resId: (res as any)?._id,
      applied: {
        shortDescription: shortText,
        seoDescription: metaText,
      },
    });
  } catch (err: any) {
    return withCorsJSON(
      { ok: false, error: err?.message || String(err) },
      500
    );
  }
}
