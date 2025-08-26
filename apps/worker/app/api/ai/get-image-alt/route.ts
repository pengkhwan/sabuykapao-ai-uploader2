// apps/worker/app/api/ai/get-image-alt/route.ts
import { NextRequest } from "next/server";
import { sanity } from "../../../../lib/sanity";
import { options204, withCorsJSON } from "../../../../lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const toPub = (id: string) =>
  id && id.startsWith("drafts.") ? id.slice(7) : id;

export function OPTIONS() {
  return options204();
}

async function handle(req: NextRequest) {
  try {
    const url = new URL(req.url);
    let docId = url.searchParams.get("docId") || "";

    if (!docId) {
      try {
        const body: any = await req.json();
        if (body && typeof body.docId === "string") {
          docId = body.docId;
        }
      } catch {
        // ignore parse error
      }
    }

    if (!docId) {
      return withCorsJSON({ ok: false, error: "Missing docId" }, 400);
    }

    const pub = toPub(docId);
    const doc = await sanity.fetch(`*[_id==$id][0]{ aiPreview }`, { id: pub });

    const alt: string | null = doc?.aiPreview?.result?.image?.alt ?? null;
    const filename: string | null =
      doc?.aiPreview?.result?.image?.filename ?? null;

    return withCorsJSON({ ok: true, alt, filename });
  } catch (err: any) {
    return withCorsJSON(
      { ok: false, error: err?.message || String(err) },
      500
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
