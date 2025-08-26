// apps/worker/app/api/ai/apply-image-alt/route.ts
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

    // ตรวจว่ามีรูปหลัก และอ่านผล ALT จาก aiPreview
    const data = await sanity.fetch(
      `*[_id==$id][0]{
        "hasImage": defined(image.asset),
        aiPreview
      }`,
      { id: pubId }
    );

    if (!data) {
      return withCorsJSON({ ok: false, error: "Document not found" }, 404);
    }
    if (!data.hasImage) {
      return withCorsJSON(
        { ok: false, error: "No main image to apply ALT" },
        400
      );
    }

    const alt: string | undefined = data?.aiPreview?.result?.image?.alt;
    if (!alt) {
      return withCorsJSON(
        {
          ok: false,
          error: "No ALT found in aiPreview. Run image_alt_rename first.",
        },
        400
      );
    }

    // เขียนเฉพาะฟิลด์ย่อย เพื่อไม่ทับ asset อื่นๆ
    const res = await sanity.patch(pubId).set({ "image.alt": alt }).commit();

    return withCorsJSON({
      ok: true,
      resId: (res as any)?._id,
      applied: { alt },
    });
  } catch (err: any) {
    return withCorsJSON(
      { ok: false, error: err?.message || String(err) },
      500
    );
  }
}
