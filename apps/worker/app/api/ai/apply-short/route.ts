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

    // อ่านผลล่าสุดจาก aiPreview
    const doc = await sanity.fetch(
      `*[_id==$id][0]{ aiPreview }`,
      { id: docId }
    );

    const shortText: string | undefined = doc?.aiPreview?.result?.short_description;
    const metaText: string  | undefined = doc?.aiPreview?.result?.meta_description;

    if (!shortText || !metaText) {
      return NextResponse.json(
        { ok: false, error: "No short/meta in aiPreview. Run short_generate first." },
        { status: 400, headers: cors({ "Content-Type": "application/json" }) }
      );
    }

    // เขียนกลับ: shortDescription และ seo.seoDescription
    const res = await sanity
      .patch(docId)
      .setIfMissing({ seo: { _type: "seo" } })
      .set({
        shortDescription: shortText,
        "seo.seoDescription": metaText,
      })
      .commit();

    return NextResponse.json(
      { ok: true, resId: (res as any)?._id, applied: { shortDescription: shortText, seoDescription: metaText } },
      { headers: cors({ "Content-Type": "application/json" }) }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500, headers: cors({ "Content-Type": "application/json" }) }
    );
  }
}
