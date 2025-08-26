import { inngest } from "../../inngest";
import { generateJSON } from "../../../lib/gemini";
import { sanity } from "../../../lib/sanity";

type Out = { gallery_alts: string[] };

export const productGalleryAltGenerate = inngest.createFunction(
  { id: "ai.product.gallery_alt_generate" },
  { event: "ai/product.gallery_alt_generate" },
  async ({ event }) => {
    const { docId } = (event.data || {}) as { docId: string };
    if (!docId) throw new Error("Missing docId");

    // ดึงรายการรูปในแกลเลอรี่
    const doc = await sanity.fetch(
      `*[_id==$id][0]{
        name,
        "gallery": gallery[]{
          _key,
          "ref": asset->_id,
          "hasAsset": defined(asset)
        }
      }`,
      { id: docId }
    );

    if (!doc) throw new Error("Product not found");
    const items =
      (doc.gallery || []).filter((g: any) => g && g.hasAsset && g.ref);

    if (!items.length) throw new Error("No gallery images");

    // ให้ AI สร้าง ALT (EN 6–12 คำ) จำนวนเท่ารูป
    const count = items.length;
    const example = {
      gallery_alts: Array.from({ length: count }, (_, i) =>
        `product gallery photo ${i + 1} - ${doc.name || "item"}`
      ),
    };

    const schema = {
      type: "object",
      properties: {
        gallery_alts: {
          type: "array",
          items: { type: "string", minLength: 6, maxLength: 120 },
          maxItems: count,
        },
      },
      required: ["gallery_alts"],
      additionalProperties: false,
      example: JSON.stringify(example),
    };

    const out = await generateJSON<Out>({
      schema,
      prompt:
        `Generate concise ALT text in English (6–12 words) for each gallery image of product "${doc.name}". ` +
        `Return an array "gallery_alts" with ${count} items.`,
      system: "Return JSON only. No explanations.",
      maxOutputTokens: 512,
    });

    // รวม key/ref ไว้ด้วยเพื่อใช้ apply ภายหลัง
    const result = {
      gallery: items.map((it: any, i: number) => ({
        key: it._key,
        ref: it.ref,
        alt: out.gallery_alts[i] || "",
      })),
    };

    await sanity
      .patch(docId)
      .set({
        aiPreview: {
          event: "gallery_alt_generate",
          result,
          name: doc.name ?? null,
          createdAt: new Date().toISOString(),
          meta: null,
        },
      })
      .commit();

    return { ok: true, count, result };
  }
);
