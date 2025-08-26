import { NextRequest, NextResponse } from "next/server";

const EVENT_KEY = process.env.INNGEST_EVENT_KEY || "dev";
const ORIGIN = process.env.STUDIO_ORIGIN || "http://localhost:3333";

function cors(headers: Record<string, string> = {}) {
  return {
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...headers,
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: cors() });
}

export async function POST(req: NextRequest) {
  const { name, data } = await req.json(); // { name, data }

  const resp = await fetch(`http://127.0.0.1:8288/e/${EVENT_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, data }),
  });

  const text = await resp.text();
  return NextResponse.json(
    { ok: resp.ok, status: resp.status, body: text },
    { headers: cors({ "Content-Type": "application/json" }) }
  );
}
