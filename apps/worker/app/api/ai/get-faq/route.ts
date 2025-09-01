// apps/worker/app/api/ai/get-faq/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { sanity } from "../../../../lib/sanity";              // ✅ ไม่มี /src/
import { options204, withCorsJSON } from "../../../../lib/cors";

export function OPTIONS() { return options204(); }

type FaqPreviewItem = { question?: string; answer?: string };
type FaqPreview = FaqPreviewItem[];

function toPub(id?: string) {
  return id && id.startsWith("drafts.") ? id.slice(7) : id || "";
}

const clamp = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

function normalize(items: FaqPreview, maxQ = 140, maxA = 600) {
  const seen = new Set<string>();
  const out: { question: string; answer: string }[] = [];
  const reasons: string[] = [];
  for (const [i, it] of (items || []).entries()) {
    const rawQ = String(it?.question ?? "").trim();
    const rawA = String(it?.answer ?? "").trim();
    if (!rawQ || !rawA) {
      reasons.push(`row ${i}: missing question/answer`);
      continue;
    }
    const q = clamp(rawQ, maxQ);
    const a = clamp(rawA, maxA);
    const key = q.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) {
      reasons.push(`row ${i}: duplicate question`);
      continue;
    }
    seen.add(key);
    out.push({ question: q, answer: a });
  }
  return { out, reasons };
}

async function readPreview(pubId: string) {
  const q = `*[_id == $id][0].aiPreview.result.faq`;
  const raw = await sanity.fetch<FaqPreview | null>(q, { id: pubId }).catch(() => null);
  return Array.isArray(raw) ? raw : [];
}

async function handle(req: NextRequest) {
  // รองรับทั้ง GET params และ POST body
  const url = req.nextUrl;
  const isPost = req.method === "POST";
  const body = isPost ? await req.json().catch(() => ({} as any)) : ({} as any);

  const rawId = (isPost ? body?.docId : url.searchParams.get("docId")) || "";
  const pubId = toPub(String(rawId));
  if (!pubId) return withCorsJSON({ ok: false, message: "Missing docId", items: [] }, 400);

  const limitParam = (isPost ? body?.limit : url.searchParams.get("limit")) ?? "";
  let limit = parseInt(String(limitParam), 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 0; // 0 = ไม่บังคับตัด

  const debug = (isPost ? body?.debug : url.searchParams.get("debug")) ?? "";
  const debugMode = debug === "1" || debug === 1 || debug === true;

  // 1) อ่าน preview
  const raw = await readPreview(pubId);

  // 2) ทำความสะอาดเบื้องต้น (เหมือนฝั่ง apply)
  const { out, reasons } = normalize(raw, 140, 600);
  const items = limit > 0 ? out.slice(0, limit) : out;

  // ตอบแบบ backward compatible:
  // ก่อนหน้า: { ok:true, items:[...], raw:{ items:[...] } }
  const payload: any = {
    ok: true,
    items,
    raw: debugMode ? { itemsRaw: raw, normalized: out, reasons } : { items: raw },
    count: items.length,
  };

  return withCorsJSON(payload);
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
