// apps/worker/app/api/ai/get-article-image-alt/route.ts
// Read previewed ALT texts for Article (featured + body images) from aiPreview.result.imageAlts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { sanity } from "../../../../lib/sanity";            // ✅ ไม่มี /src/
import { options204, withCorsJSON } from "../../../../lib/cors";

export function OPTIONS() {
  return options204();
}

function toBool(v: string | null): boolean {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function toInt(v: string | null, fallback = 0): number {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function toPub(id?: string | null) {
  if (!id) return "";
  return id.startsWith("drafts.") ? id.slice(7) : id;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const docIdRaw = searchParams.get("docId");
    const docId = toPub(docIdRaw);
    const debug = toBool(searchParams.get("debug"));
    const limit = toInt(searchParams.get("limit"), 0); // 0 = no limit

    if (!docId) {
      return withCorsJSON({ ok: false, error: "Missing docId" }, 400);
    }

    // Read only the preview node to keep it light
    const data = await sanity.fetch(
      `
      *[_id == $id][0]{
        _id,
        "imageAlts": aiPreview.result.imageAlts
      }
    `,
      { id: docId }
    );

    const imageAlts = data?.imageAlts || null;

    // Normalize featured
    const featured =
      imageAlts?.featured && typeof imageAlts.featured.alt === "string"
        ? { alt: String(imageAlts.featured.alt) }
        : null;

    // Normalize body items
    const bodyItems: Array<{ key: string; alt: string }> = Array.isArray(imageAlts?.body?.items)
      ? imageAlts.body.items
          .filter((x: any) => x && typeof x.alt === "string" && typeof x.key === "string")
          .map((x: any) => ({ key: x.key, alt: x.alt }))
      : [];

    const itemsLimited = limit > 0 ? bodyItems.slice(0, Math.max(0, limit)) : bodyItems;

    const resp: any = {
      ok: true,
      featured,                              // { alt } | null
      body: {
        count: itemsLimited.length,
        items: itemsLimited,
      },
    };

    if (debug) {
      resp.raw = { imageAlts };
    }

    return withCorsJSON(resp, 200);
  } catch (err: any) {
    return withCorsJSON(
      { ok: false, error: err?.message || String(err) },
      500
    );
  }
}
