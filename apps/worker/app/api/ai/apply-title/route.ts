// apps/worker/app/api/ai/apply-title/route.ts
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
    const { docId, index = 0 } = (await req.json()) as {
      docId?: string;
      index?: number;
    };

    if (!docId) {
      return withCorsJSON({ ok: false, error: "Missing docId" }, 400);
    }

    const pubId = toPub(docId);

    // อ่าน titles จาก aiPreview บนเอกสาร publish เสมอ
    const doc = await sanity.fetch(`*[_id==$id][0]{ aiPreview }`, { id: pubId });
    const titles: string[] | undefined = doc?.aiPreview?.result?.titles;

    if (!Array.isArray(titles) || titles.length === 0) {
      return withCorsJSON(
        { ok: false, error: "No AI titles found on aiPreview" },
        400
      );
    }

    const i = Math.max(0, Math.min(Number(index ?? 0), titles.length - 1));
    const title = titles[i];

    // เขียนกลับชื่อเรื่องไปที่เอกสาร publish
    const res = await sanity.patch(pubId).set({ name: title }).commit();

    return withCorsJSON({
      ok: true,
      appliedIndex: i,
      title,
      resId: (res as any)?._id,
    });
  } catch (err: any) {
    return withCorsJSON(
      { ok: false, error: err?.message || String(err) },
      500
    );
  }
}
