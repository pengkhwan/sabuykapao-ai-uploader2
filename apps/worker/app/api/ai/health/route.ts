// apps/worker/app/api/ai/health/route.ts
import { options204, withCorsJSON } from "../../../../lib/cors";
import { sanity } from "../../../../lib/sanity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS() {
  return options204();
}

export async function GET() {
  try {
    // 1) เช็ก env คร่าว ๆ
    const env = {
      projectId: process.env.SANITY_PROJECT_ID || "",
      dataset: process.env.SANITY_DATASET || "",
      tokenPresent: !!process.env.SANITY_TOKEN,
    };

    // 2) ping sanity แบบเบา ๆ
    // ใช้ query ถูกแต่ไม่หนัก (แค่คืน true/false)
    const ok = await sanity.fetch<boolean>(
      'count(*[defined(_id)]) > 0'
    ).then(Boolean).catch(() => false);

    return withCorsJSON({
      ok: true,
      sanityOk: ok,
      env,
      inngestEndpoint: "/api/inngest",
      now: new Date().toISOString(),
    });
  } catch (e: any) {
    return withCorsJSON({ ok: false, error: e?.message || String(e) }, 500);
  }
}
