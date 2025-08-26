import { NextRequest, NextResponse } from "next/server";
import { sanity } from "../../../../lib/sanity";

const ORIGIN = process.env.STUDIO_ORIGIN || "http://localhost:3333";
const toPub = (id: string) => (id && id.startsWith("drafts.") ? id.slice(7) : id);

function cors(extra: Record<string, string> = {}) {
  return {
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extra,
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: cors() });
}

async function handle(req: NextRequest) {
  try {
    const url = new URL(req.url);
    let docId = url.searchParams.get("docId") || "";

    if (!docId) {
      try {
        const body: any = await req.json();
        if (body && typeof body.docId === "string") docId = body.docId;
      } catch {
        // ignore parse error
      }
    }

    if (!docId) {
      return NextResponse.json(
        { ok: false, error: "Missing docId" },
        { status: 400, headers: cors({ "Content-Type": "application/json" }) }
      );
    }

    const pub = toPub(docId);
    const doc = await sanity.fetch(
      `*[_id==$id][0]{ aiPreview }`,
      { id: pub }
    );

    const shortText: string | undefined = doc?.aiPreview?.result?.short_description;
    const metaText:  string | undefined = doc?.aiPreview?.result?.meta_description;

    return NextResponse.json(
      { ok: true, short: shortText || null, meta: metaText || null },
      { headers: cors({ "Content-Type": "application/json" }) }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500, headers: cors({ "Content-Type": "application/json" }) }
    );
  }
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
