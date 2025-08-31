// apps/worker/app/api/ai/apply-faq/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { sanity } from "../../../../lib/sanity";
import { options204, withCorsJSON } from "../../../../lib/cors";

export function OPTIONS() { return options204(); }

function toPub(id: string) {
  return id?.startsWith("drafts.") ? id.slice("drafts.".length) : id;
}

type PreviewFAQ = { question?: string; answer?: string };

function asFaqItems(preview: PreviewFAQ[]) {
  const items = (preview || [])
    .map((x) => ({
      _type: "faqItem",
      // ให้ Sanity auto สร้าง _key ถ้าเปิด autoGenerateArrayKeys ในโปรเจกต์
      question: String(x?.question ?? "").trim(),
      answer: String(x?.answer ?? "").trim(),
    }))
    // กรองรายการว่าง
    .filter((x) => x.question || x.answer);
  return items;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const docId = toPub(body?.docId || "");
    if (!docId) {
      return withCorsJSON({ ok: false, code: "BAD_REQUEST", message: "Missing docId" }, 400);
    }

    // ดึง preview
    const query = `*[_id == $id][0]{ "items": coalesce(aiPreview.result.faq, []) }`;
    const data = await sanity.fetch(query, { id: docId });
    const preview = Array.isArray(data?.items) ? data.items as PreviewFAQ[] : [];

    const faqItems = asFaqItems(preview);
    // เขียนลงฟิลด์จริง faq[] (overwrite ทั้งก้อน)
    const res = await sanity
      .patch(docId)
      .set({ faq: faqItems })
      .commit({ autoGenerateArrayKeys: true });

    return withCorsJSON({
      ok: true,
      applied: faqItems.length,
      resId: res?._id || docId,
    });
  } catch (err: any) {
    return withCorsJSON({ ok: false, code: "INTERNAL", message: err?.message || "Error" }, 500);
  }
}
