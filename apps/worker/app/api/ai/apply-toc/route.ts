// apps/worker/app/api/ai/apply-toc/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { sanity } from "../../../../lib/sanity"; // ✅ ไม่มี /src/

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
};

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
  // ให้ preflight ผ่านแน่ ๆ
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    // กันกรณี body ว่าง/ไม่ใช่ JSON
    let json: any = null;
    try {
      json = await req.json();
    } catch {
      return new NextResponse(
        JSON.stringify({ ok: false, error: "Invalid JSON body" }),
        { status: 400, headers: CORS }
      );
    }

    const docId = toPub(json?.docId);
    if (!docId) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: "Missing docId" }),
        { status: 400, headers: CORS }
      );
    }

    const items = await readTocFromPreview(docId);
    if (!items.length) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: "No TOC in aiPreview" }),
        { status: 400, headers: CORS }
      );
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

    return new NextResponse(
      JSON.stringify({ ok: true, count: mapped.length, id: (res as any)?._id }),
      { status: 200, headers: CORS }
    );
  } catch (e: any) {
    // โชว์รายละเอียดจาก Sanity ถ้ามี (ช่วยดีบัก "Failed to fetch")
    const msg =
      e?.responseBody?.toString?.() ||
      e?.message ||
      String(e);
    console.error("[apply-toc] error:", msg);
    return new NextResponse(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: CORS,
    });
  }
}
