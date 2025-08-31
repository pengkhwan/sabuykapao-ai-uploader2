// apps/worker/app/api/ai/apply-title/route.ts
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

/** ---------- helpers: normalize & trim (≤60 chars) ---------- */
function normalizeText(v: string): string {
  const noHtml = v.replace(/<[^>]+>/g, " ");
  const oneLine = noHtml.replace(/[\r\n]+/g, " ");
  return oneLine.replace(/\s+/g, " ").trim();
}

function smartTrim(v: string, max = 60): string {
  const s = normalizeText(v);
  if (s.length <= max) return s;
  const slice = s.slice(0, max + 1);
  const sp = slice.lastIndexOf(" ");
  if (sp >= 40) return s.slice(0, sp).trim();
  return s.slice(0, max).trim();
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
    const rawTitle = titles[i];
    const title = smartTrim(rawTitle, 60); // enforce ≤ 60

    // เขียนกลับ: name + seo.seoTitle
    const res = await sanity
      .patch(pubId)
      .setIfMissing({ seo: { _type: "seo" } })
      .set({ name: title, "seo.seoTitle": title })
      .commit();

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
