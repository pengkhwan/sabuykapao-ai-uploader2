import { inngest } from "../../inngest";
import { generateJSON } from "../../../lib/gemini";
import { sanity } from "../../../lib/sanity";

type TitleOut = { titles: string[] };

export const productTitleSuggest = inngest.createFunction(
  { id: "ai.product.title_suggest" },
  { event: "ai/product.title_suggest" },
  async ({ event }) => {
    const { docId, name, max = 3, meta } = (event.data || {}) as {
      docId: string;
      name?: string;
      max?: number;
      meta?: any;
    };

    if (!docId) throw new Error("Missing docId");

    console.log("[product-title] received event", { docId, name, max, meta });

    const schema = {
      type: "object",
      properties: {
        titles: { type: "array", items: { type: "string" }, maxItems: max },
      },
      required: ["titles"],
      additionalProperties: false,
      example: JSON.stringify({
        titles: [
          "กระเป๋าหนังวัวแท้ ทรงมินิ ใช้ทุกวัน",
          "Mini Leather Wallet – Hand-stitched",
          "Compact Cowhide Wallet, Everyday Use",
        ],
      }),
    };

    const out = await generateJSON<TitleOut>({ schema });
    console.log("[product-title] generated output", out);

    const res = await sanity
      .patch(docId)
      .set({
        aiPreview: {
          event: "title_suggest",
          result: out,
          name: name ?? null,
          createdAt: new Date().toISOString(),
          meta: meta ?? null,
        },
      })
      .commit();

    console.log("[product-title] patched aiPreview OK", { resId: (res as any)?._id });
    return { ok: true, result: out };
  }
);
