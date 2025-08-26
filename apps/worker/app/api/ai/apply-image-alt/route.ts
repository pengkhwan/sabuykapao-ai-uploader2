import { NextRequest, NextResponse } from "next/server";
import { sanity } from "../../../../lib/sanity";

const ORIGIN = process.env.STUDIO_ORIGIN || "http://localhost:3333";

function cors(extra: Record<string, string> = {}) {
  return {
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extra,
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: cors() });
}

export async function POST(req: NextRequest) {
  try {
    const { docId } = (await req.json()) as { docId: string };
    if (!docId) {
      return NextResponse.json(
        { ok: false, error: "Missing docId" },
        { status: 400, headers: cors({ "Content-Type": "application/json" }) }
      );
    }

    // ตรวจว่ามีรูปหลัก และอ่านผล ALT จาก aiPreview
    const data = await sanity.fetch(
      `*[_id==$id][0]{
        "hasImage": defined(image.asset),
        aiPreview
      }`,
      { id: docId }
    );

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Document not found" },
        { status: 404, headers: cors({ "Content-Type": "application/json" }) }
      );
    }
    if (!data.hasImage) {
      return NextResponse.json(
        { ok: false, error: "No main image to apply ALT" },
        { status: 400, headers: cors({ "Content-Type": "application/json" }) }
      );
    }

    const alt: string | undefined = data?.aiPreview?.result?.image?.alt;
    if (!alt) {
      return NextResponse.json(
        { ok: false, error: "No ALT found in aiPreview. Run image_alt_rename first." },
        { status: 400, headers: cors({ "Content-Type": "application/json" }) }
      );
    }

    // เขียนเฉพาะฟิลด์ย่อย เพื่อไม่ทับ asset อื่นๆ
    const res = await sanity.patch(docId).set({ "image.alt": alt }).commit();

    return NextResponse.json(
      { ok: true, resId: (res as any)?._id, applied: { alt } },
      { headers: cors({ "Content-Type": "application/json" }) }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500, headers: cors({ "Content-Type": "application/json" }) }
    );
  }
}
