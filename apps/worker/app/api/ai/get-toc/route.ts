// apps/worker/app/api/ai/get-toc/route.ts
import { NextRequest } from "next/server";
import { sanity } from "../../../../lib/sanity";
import { options204, withCorsJSON } from "../../../../lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const toPub = (id?: string) =>
  id && id.startsWith("drafts.") ? id.slice(7) : (id || "");

async function readTocOnly(docId: string) {
  const q = `*[_id == $id][0]{ "items": coalesce(aiPreview.result.toc, []) }`;
  const res = await sanity.fetch(q, { id: docId });
  return Array.isArray(res?.items) ? res.items : [];
}

export function OPTIONS() {
  return options204();
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const docId = toPub(searchParams.get("docId") || "");
    const debug = searchParams.get("debug") === "1";

    if (!docId) {
      return withCorsJSON({ ok: false, error: "Missing docId" }, 400);
    }

    const items = await readTocOnly(docId);
    const body: any = { ok: true, count: items.length, items };

    if (debug) body._debug = { docId };

    return withCorsJSON(body);
  } catch (e: any) {
    console.error("[get-toc][GET] error:", e?.responseBody || e?.message || e);
    return withCorsJSON({ ok: false, error: e?.message || String(e) }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    let json: any = null;
    try {
      json = await req.json();
    } catch {
      // ignore parse error
    }

    const docId = toPub(json?.docId);
    const debug = !!json?.debug;

    if (!docId) {
      return withCorsJSON({ ok: false, error: "Missing docId" }, 400);
    }

    const items = await readTocOnly(docId);
    const body: any = { ok: true, count: items.length, items };
    if (debug) body._debug = { docId };

    return withCorsJSON(body);
  } catch (e: any) {
    console.error("[get-toc][POST] error:", e?.responseBody || e?.message || e);
    return withCorsJSON({ ok: false, error: e?.message || String(e) }, 500);
  }
}
