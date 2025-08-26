import { NextRequest, NextResponse } from "next/server";
import { sanity } from "../../../../lib/sanity";

const ORIGIN = process.env.STUDIO_ORIGIN || "http://localhost:3333";
const cors = (extra: Record<string, string> = {}) => ({
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  ...extra,
});

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

    // อ่านรายการรูปและผลจาก aiPreview
    const data = await sanity.fetch(
      `*[_id==$id][0]{
        "gallery": gallery[] {_key},
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

    const suggestions: Array<{ key: string; alt: string }> =
      data?.aiPreview?.result?.gallery || [];

    if (!Array.isArray(suggestions) || !suggestions.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No gallery suggestions in aiPreview. Run gallery_alt_generate first.",
        },
        { status: 400, headers: cors({ "Content-Type": "application/json" }) }
      );
    }

    // สร้าง mapping key -> alt แล้ว set ทีละรายการ
    const altByKey = new Map(suggestions.map((s) => [s.key, s.alt]));
    const sets: Record<string, string> = {};
    let appliedCount = 0;

    for (const g of data.gallery || []) {
      const alt = altByKey.get(g._key);
      if (alt) {
        sets[`gallery[_key=="${g._key}"].alt`] = alt;
        appliedCount++;
      }
    }

    if (!appliedCount) {
      return NextResponse.json(
        { ok: false, error: "No matching gallery items to apply." },
        { status: 400, headers: cors({ "Content-Type": "application/json" }) }
      );
    }

    const res = await sanity.patch(docId).set(sets).commit();

    return NextResponse.json(
      { ok: true, resId: (res as any)?._id, appliedCount },
      { headers: cors({ "Content-Type": "application/json" }) }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500, headers: cors({ "Content-Type": "application/json" }) }
    );
  }
}
