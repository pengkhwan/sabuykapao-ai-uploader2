// apps/worker/app/api/ai/trigger/route.ts
import { NextRequest } from "next/server";
import { options204, withCorsJSON } from "../../../../lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const EVENT_KEY = process.env.INNGEST_EVENT_KEY || "dev";
const EVENT_URL =
  process.env.INNGEST_EVENT_URL || `http://127.0.0.1:8288/e/${EVENT_KEY}`;

export function OPTIONS() {
  return options204();
}

export async function POST(req: NextRequest) {
  try {
    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return withCorsJSON({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const name = payload?.name;
    const data = payload?.data ?? {};

    if (!name || typeof name !== "string") {
      return withCorsJSON({ ok: false, error: "Missing or invalid 'name'" }, 400);
    }

    // ส่ง event ไปที่ Inngest dev server
    const resp = await fetch(EVENT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, data }),
    });

    const text = await resp.text();

    return withCorsJSON({
      ok: resp.ok,
      status: resp.status,
      body: text,
      eventUrl: EVENT_URL,
    });
  } catch (err: any) {
    return withCorsJSON(
      { ok: false, error: err?.message || String(err) },
      500
    );
  }
}
