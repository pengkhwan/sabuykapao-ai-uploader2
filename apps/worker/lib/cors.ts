// apps/worker/lib/cors.ts
import { NextResponse } from "next/server";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
} as const;

export function options204() {
  return new NextResponse(null, { status: 204, headers: CORS as any });
}

export function withCorsJSON(data: any, init: number | ResponseInit = 200) {
  const respInit = typeof init === "number" ? { status: init } : init || {};
  return NextResponse.json(data, { ...respInit, headers: CORS as any });
}
