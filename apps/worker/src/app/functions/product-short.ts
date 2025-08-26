import { inngest } from "../../inngest";
import { generateJSON } from "../../../lib/gemini";
import { sanity } from "../../../lib/sanity";

type ShortOut = {
  short_description: string;
  meta_description: string;
};

export const productShortGenerate = inngest.createFunction(
  { id: "ai.product.short_generate" },
  { event: "ai/product.short_generate" },
  async ({ event }) => {
    const { docId, name, limit = 160, meta } = (event.data || {}) as {
      docId: string;
      name?: string;
      limit?: number;
      meta?: any;
    };

    if (!docId) throw new Error("Missing docId");
    console.log("[product-short] received event", { docId, name, limit, meta });

    const schema = {
      type: "object",
      properties: {
        short_description: { type: "string", maxLength: Math.max(80, Number(limit) || 160) },
        meta_description:  { type: "string", minLength: 140, maxLength: 160 }
      },
      required: ["short_description", "meta_description"],
      additionalProperties: false,
      example: JSON.stringify({
        short_description: "กระเป๋าหนังวัวแท้ทนทาน ดีไซน์มินิมอล เหมาะใช้ทุกวัน น้ำหนักเบา",
        meta_description:  "กระเป๋าหนังวัวแท้ ทรงมินิมอล น้ำหนักเบา ใช้ได้ทุกวัน จุของพอดี 140160 ตัวอักษรสำหรับ SEO"
      }),
    };

    const out = await generateJSON<ShortOut>({ schema });
    console.log("[product-short] generated output", out);

    const res = await sanity
      .patch(docId)
      .set({
        aiPreview: {
          event: "short_generate",
          result: out,
          name: name ?? null,
          createdAt: new Date().toISOString(),
          meta: meta ?? null,
        },
      })
      .commit();

    console.log("[product-short] patched aiPreview OK", { resId: (res as any)?._id });
    return { ok: true, result: out };
  }
);
