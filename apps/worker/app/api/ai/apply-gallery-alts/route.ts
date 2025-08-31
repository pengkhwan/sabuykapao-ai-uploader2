// apps/worker/app/api/ai/apply-gallery-alts/route.ts
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

/** ---------- helpers: normalize ALT ---------- */
function normalizeAlt(v: string): string {
  const noHtml = v.replace(/<[^>]+>/g, " ");
  const oneLine = noHtml.replace(/[\r\n]+/g, " ");
  const noEmojis = oneLine.replace(
    /[\u0000-\u001F\u007F-\u009F\u2000-\u200F\u2028\u2029\u2066-\u2069\uFE00-\uFE0F\uFFFD]/g,
    " "
  );
  const collapsed = noEmojis.replace(/\s+/g, " ").trim();
  return collapsed.replace(/^["'“”‘’]|["'“”‘’]$/g, "");
}

function clampAlt(v: string, maxWords = 16, maxChars = 120): string {
  const norm = normalizeAlt(v);
  if (!norm) return "";
  const words = norm.split(" ").filter(Boolean);
  const limitedWords = words.slice(0, maxWords).join(" ");
  if (limitedWords.length <= maxChars) return limitedWords;
  const slice = limitedWords.slice(0, maxChars + 1);
  const sp = slice.lastIndexOf(" ");
  return (sp > 40 ? slice.slice(0, sp) : slice.slice(0, maxChars)).trim();
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

    const suggestions: Array<{ key?: string; alt?: string }> =
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

    // สร้าง mapping key -> alt (หลัง normalize+clamp)
    const altByKey = new Map<string, string>();
    for (const s of suggestions) {
      if (!s?.key || typeof s.key !== "string") continue;
      const cleaned = clampAlt(String(s.alt || ""), 16, 120);
      if (cleaned) altByKey.set(s.key, cleaned);
    }

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
