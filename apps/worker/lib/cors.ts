// apps/worker/lib/cors.ts
import { NextResponse } from "next/server";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  // ให้เบราว์เซอร์อ่านค่า header เพิ่มเติมได้ (เช่น X-RateLimit-*)
  "Access-Control-Expose-Headers": "X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After",
} as const;

/** ตอบ OPTIONS (preflight) ด้วย 204 + CORS headers */
export function options204() {
  return new NextResponse(null, { status: 204, headers: CORS as any });
}

/** ส่ง JSON พร้อม CORS headers */
export function withCorsJSON(data: any, init: number | ResponseInit = 200) {
  const respInit = typeof init === "number" ? { status: init } : (init || {});
  return NextResponse.json(data, { ...respInit, headers: CORS as any });
}
