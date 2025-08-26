// apps/worker/app/api/ai/get-titles/route.ts
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
    // 1) รับ docId จาก query string หรือ body (อย่างใดอย่างหนึ่ง)
    const url = new URL(req.url);
    let docId = url.searchParams.get("docId") || "";

    if (!docId) {
      try {
        const body: any = await req.json();
        if (body && typeof body.docId === "string") docId = body.docId;
      } catch {
        // body ว่าง/parse ไม่ได้ ปล่อยผ่าน ไปเช็ค docId ด้านล่าง
      }
    }

    if (!docId) {
      return withCorsJSON({ ok: false, error: "Missing docId" }, 400);
    }

    const pub = toPub(docId);
    console.log("[get-titles] docId=", docId, "pub=", pub);

    // 2) อ่านจาก published เสมอ (เราบันทึก aiPreview ไว้ที่ตัว publish)
    const doc = await sanity.fetch(`*[_id==$id][0]{ aiPreview }`, { id: pub });
    const titles: string[] | undefined = doc?.aiPreview?.result?.titles;

    return withCorsJSON({
      ok: true,
      titles: Array.isArray(titles) ? titles : [],
    });
  } catch (err: any) {
    console.error("[get-titles] error", err);
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
