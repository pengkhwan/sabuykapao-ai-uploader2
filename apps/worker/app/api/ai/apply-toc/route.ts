// apps/worker/app/api/ai/apply-toc/route.ts
import { NextRequest } from "next/server";
import { sanity } from "../../../../lib/sanity";
import { options204, withCorsJSON } from "../../../../lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const toPub = (id?: string) =>
  id && id.startsWith("drafts.") ? id.slice(7) : (id || "");

// สร้าง _key ที่ใช้ได้ทั้ง node/edge
function makeKey() {
  try {
    // @ts-ignore
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const c = require("crypto");
    if (c?.randomUUID) return c.randomUUID();
  } catch {}
  return Math.random().toString(36).slice(2);
}

async function readTocFromPreview(docId: string) {
  const data = await sanity.fetch(
    `*[_id == $id][0]{ "items": coalesce(aiPreview.result.toc, []) }`,
    { id: docId }
  );
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.map((it: any) => ({
    _key: typeof it?._key === "string" ? it._key : makeKey(),
    text: String(it?.text ?? ""),
    anchor: String(it?.anchor ?? ""),
  }));
}

export function OPTIONS() {
  return options204();
}

export async function POST(req: NextRequest) {
  try {
    // กันกรณี body ว่าง/ไม่ใช่ JSON
    let json: any = null;
    try {
      json = await req.json();
    } catch {
      return withCorsJSON({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const docId = toPub(json?.docId);
    if (!docId) {
      return withCorsJSON({ ok: false, error: "Missing docId" }, 400);
    }

    const items = await readTocFromPreview(docId);
    if (!items.length) {
      return withCorsJSON({ ok: false, error: "No TOC in aiPreview" }, 400);
    }

    // map ให้ตรง schema: array of { _type: "tocItem", label, anchorId }
    const mapped = items.map((it) => ({
      _key: it._key || makeKey(),
      _type: "tocItem",
      label: it.text,
      anchorId: it.anchor,
    }));

    const res = await sanity
      .patch(docId)
      .setIfMissing({ toc: [] })
      .set({ toc: mapped })
      .commit({ autoGenerateArrayKeys: true });

    return withCorsJSON({
      ok: true,
      count: mapped.length,
      id: (res as any)?._id,
    });
  } catch (e: any) {
    const msg = e?.responseBody?.toString?.() || e?.message || String(e);
    console.error("[apply-toc] error:", msg);
    return withCorsJSON({ ok: false, error: msg }, 500);
  }
}
