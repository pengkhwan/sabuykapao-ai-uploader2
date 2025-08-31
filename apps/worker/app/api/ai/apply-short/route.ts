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

/** ---------- helpers: normalize & trim ---------- */
const toPub = (id?: string) =>
  id && id.startsWith("drafts.") ? id.slice(7) : (id || "");

// very light HTML stripper + whitespace normalizer
function normalizeText(v: string): string {
  const noHtml = v.replace(/<[^>]+>/g, " "); // strip tags
  const noBreaks = noHtml.replace(/[\r\n]+/g, " "); // single line
  const collapsed = noBreaks.replace(/\s+/g, " ").trim();
  return collapsed;
}

// prefer trimming at sentence boundary before max; fallback hard cut
function smartTrim(v: string, max: number): string {
  const s = normalizeText(v);
  if (s.length <= max) return s;
  // look for last sentence end before max (., !, ?)
  const slice = s.slice(0, max + 1);
  const m = slice.lastIndexOf(".");
  const e = Math.max(m, slice.lastIndexOf("!"), slice.lastIndexOf("?"));
  if (e >= 60) return s.slice(0, e + 1).trim(); // avoid too early cut
  // else cut at last space
  const sp = slice.lastIndexOf(" ");
  if (sp >= 60) return s.slice(0, sp).trim();
  return s.slice(0, max).trim();
}

export async function POST(req: NextRequest) {
  try {
    const { docId } = (await req.json()) as { docId?: string };
    if (!docId) {
      return withCorsJSON({ ok: false, error: "Missing docId" }, 400);
    }
    const pubId = toPub(docId);

    // อ่านผลล่าสุดจาก aiPreview
    const doc = await sanity.fetch(`*[_id==$id][0]{ aiPreview }`, {
      id: pubId,
    });

    const aiShort: string | undefined =
      doc?.aiPreview?.result?.short_description;
    const aiMeta: string | undefined =
      doc?.aiPreview?.result?.meta_description;

    if (!aiShort || !aiMeta) {
      return withCorsJSON(
        {
          ok: false,
          error: "No short/meta in aiPreview. Run short_generate first.",
        },
        400
      );
    }

    // -------- Validation / Normalization rules --------
    // Short: max 160 chars
    const shortNormalized = smartTrim(aiShort, 160);

    // Meta: target 140–160 (trim to ≤160; if <140 and short is longer, fallback to short)
    let metaCandidate = aiMeta;
    if (normalizeText(metaCandidate).length < 140 &&
        normalizeText(aiShort).length >= 140) {
      metaCandidate = aiShort;
    }
    const metaNormalized = smartTrim(metaCandidate, 160);

    const res = await sanity
      .patch(pubId)
      .setIfMissing({ seo: { _type: "seo" } })
      .set({
        shortDescription: shortNormalized,
        "seo.seoDescription": metaNormalized,
      })
      .commit();

    return withCorsJSON({
      ok: true,
      resId: (res as any)?._id,
      applied: {
        shortDescription: shortNormalized,
        seoDescription: metaNormalized,
      },
    });
  } catch (err: any) {
    return withCorsJSON(
      { ok: false, error: err?.message || String(err) },
      500
    );
  }
}
