// apps/worker/app/api/ai/get-faq/route.ts
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const docId = toPub(searchParams.get("docId") || "");
    if (!docId) {
      return withCorsJSON({ ok: false, code: "BAD_REQUEST", message: "Missing docId" }, 400);
    }

    // อ่าน preview จาก aiPreview.result.faq[]
    const query = `*[_id == $id][0]{ "items": coalesce(aiPreview.result.faq, []) }`;
    const data = await sanity.fetch(query, { id: docId });

    const items = Array.isArray(data?.items) ? data.items : [];
    return withCorsJSON({ ok: true, items, raw: data ?? null });
  } catch (err: any) {
    return withCorsJSON({ ok: false, code: "INTERNAL", message: err?.message || "Error" }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const docId = toPub(body?.docId || "");
    if (!docId) {
      return withCorsJSON({ ok: false, code: "BAD_REQUEST", message: "Missing docId" }, 400);
    }

    const query = `*[_id == $id][0]{ "items": coalesce(aiPreview.result.faq, []) }`;
    const data = await sanity.fetch(query, { id: docId });
    const items = Array.isArray(data?.items) ? data.items : [];
    return withCorsJSON({ ok: true, items, raw: data ?? null });
  } catch (err: any) {
    return withCorsJSON({ ok: false, code: "INTERNAL", message: err?.message || "Error" }, 500);
  }
}
