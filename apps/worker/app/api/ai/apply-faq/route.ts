// apps/worker/app/api/ai/apply-faq/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { sanity } from "../../../../lib/sanity";              // ✅ ไม่มี /src/
import { options204, withCorsJSON } from "../../../../lib/cors";

export function OPTIONS() { return options204(); }

type FaqPreview = { question?: string; answer?: string }[];

function toPub(id?: string) {
  return id && id.startsWith("drafts.") ? id.slice(7) : id || "";
}

// clamp + normalize + dedup (case-insensitive, space-normalized)
const clamp = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
function normalizeFaq(items: FaqPreview, maxQ = 140, maxA = 600) {
  const seen = new Set<string>();
  const out: { question: string; answer: string }[] = [];
  for (const it of items || []) {
    const q = clamp(String(it?.question ?? "").trim(), maxQ);
    const a = clamp(String(it?.answer ?? "").trim(), maxA);
    if (!q || !a) continue;
    const key = q.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ question: q, answer: a });
  }
  return out;
}

async function readPreview(docIdPub: string) {
  const q = `*[_id == $id][0].aiPreview.result.faq`;
  const faq = await sanity.fetch<FaqPreview>(q, { id: docIdPub }).catch(() => null);
  return Array.isArray(faq) ? faq : [];
}

async function applyFaq(docIdPub: string, items: { question: string; answer: string }[]) {
  // map เป็นชนิด schema จริงของคุณ: faqItem
  return sanity
    .patch(docIdPub)
    .set({
      faq: items.map((it) => ({
        _type: "faqItem",
        question: it.question,
        answer: it.answer,
      })),
    })
    .commit({ autoGenerateArrayKeys: true });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const rawId = body?.docId || req.nextUrl.searchParams.get("docId") || "";
    const pubId = toPub(String(rawId));

    if (!pubId) {
      return withCorsJSON({ ok: false, message: "Missing docId" }, 400);
    }

    // 1) อ่าน preview
    const preview = await readPreview(pubId);
    if (!preview || preview.length === 0) {
      return withCorsJSON({ ok: false, message: "No FAQ preview found", applied: 0 }, 200);
    }

    // 2) ทำความสะอาด + จำกัดความยาว + ตัดซ้ำ
    const cleaned = normalizeFaq(preview, 140, 600);
    if (cleaned.length === 0) {
      return withCorsJSON({ ok: false, message: "FAQ preview invalid after normalization", applied: 0 }, 200);
    }

    // 3) apply ลงฟิลด์จริง
    const res = await applyFaq(pubId, cleaned);

    return withCorsJSON({
      ok: true,
      applied: cleaned.length,
      resId: res?._id || pubId,
    });
  } catch (err: any) {
    return withCorsJSON(
      {
        ok: false,
        message: err?.message || "Unexpected error",
      },
      500
    );
  }
}
