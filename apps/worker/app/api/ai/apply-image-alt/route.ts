// apps/worker/app/api/ai/apply-image-alt/route.ts
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
// remove html, newlines, collapse spaces, strip surrounding quotes
function normalizeAlt(v: string): string {
  const noHtml = v.replace(/<[^>]+>/g, " ");
  const oneLine = noHtml.replace(/[\r\n]+/g, " ");
  // optionally strip most emoji/control chars (keep basic punctuation & latin/tha)
  const noEmojis = oneLine.replace(
    /[\u0000-\u001F\u007F-\u009F\u2000-\u200F\u2028\u2029\u2066-\u2069\uFE00-\uFE0F\uFFFD]/g,
    " "
  );
  const collapsed = noEmojis.replace(/\s+/g, " ").trim();
  return collapsed.replace(/^["'“”‘’]|["'“”‘’]$/g, "");
}

// cap by word count first (ALT should be short), then by characters
function clampAlt(v: string, maxWords = 16, maxChars = 120): string {
  const norm = normalizeAlt(v);
  const words = norm.split(" ").filter(Boolean);
  const limitedWords = words.slice(0, maxWords).join(" ");
  if (limitedWords.length <= maxChars) return limitedWords;
  // soft cut at last space before maxChars
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

    const altAI: string | undefined = data?.aiPreview?.result?.image?.alt;
    if (!altAI) {
      return withCorsJSON(
        {
          ok: false,
          error: "No ALT found in aiPreview. Run image_alt_rename first.",
        },
        400
      );
    }

    // ✅ Validation / Normalization
    const alt = clampAlt(altAI, 16, 120);

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
