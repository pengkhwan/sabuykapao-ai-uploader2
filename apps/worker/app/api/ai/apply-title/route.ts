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
    const { docId, index = 0 } = (await req.json()) as {
      docId: string;
      index?: number;
    };

    if (!docId) {
      return NextResponse.json(
        { ok: false, error: "Missing docId" },
        { status: 400, headers: cors({ "Content-Type": "application/json" }) }
      );
    }

    const doc = await sanity.fetch(`*[_id==$id][0]{ aiPreview }`, { id: docId });
    const titles: string[] | undefined = doc?.aiPreview?.result?.titles;

    if (!Array.isArray(titles) || titles.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No AI titles found on aiPreview" },
        { status: 400, headers: cors({ "Content-Type": "application/json" }) }
      );
    }

    const i = Math.max(0, Math.min(Number(index ?? 0), titles.length - 1));
    const title = titles[i];

    const res = await sanity.patch(docId).set({ name: title }).commit();

    return NextResponse.json(
      { ok: true, appliedIndex: i, title, resId: (res as any)?._id },
      { headers: cors({ "Content-Type": "application/json" }) }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500, headers: cors({ "Content-Type": "application/json" }) }
    );
  }
}
