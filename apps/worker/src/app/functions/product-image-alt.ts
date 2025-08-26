import { inngest } from "../../inngest";
import { generateJSON } from "../../../lib/gemini";
import { sanity } from "../../../lib/sanity";
import slugify from "slugify";

type Out = { image: { alt: string; filename: string | null } };

export const productImageAltRename = inngest.createFunction(
  { id: "ai.product.image_alt_rename" },
  { event: "ai/product.image_alt_rename" },
  async ({ event }) => {
    const { docId } = (event.data || {}) as { docId: string };
    if (!docId) throw new Error("Missing docId");

    // อ่านข้อมูลสินค้าเท่าที่จำเป็น
    const prod = await sanity.fetch(
      `*[_id==$id][0]{ name, "slug": slug.current, "hasImage": defined(image.asset) }`,
      { id: docId }
    );
    if (!prod) throw new Error("Product not found");
    if (!prod.hasImage) throw new Error("Product has no main image");

    const base =
      prod.slug ||
      slugify(prod.name || "product", { lower: true, strict: true });

    // ให้โมเดลสร้าง ALT (EN 6–12 คำ) + ชื่อไฟล์ที่แนะนำ
    const schema = {
      type: "object",
      properties: {
        image: {
          type: "object",
          properties: {
            alt: { type: "string", minLength: 6, maxLength: 120 },
            filename: { type: ["string", "null"] },
          },
          required: ["alt", "filename"],
          additionalProperties: false,
        },
      },
      required: ["image"],
      additionalProperties: false,
      example: JSON.stringify({
        image: {
          alt: "mini leather wallet with hand-stitched edges",
          filename: `${base}.jpg`,
        },
      }),
    };

    const out = await generateJSON<Out>({
      schema,
      prompt: `Write a concise ALT (English, 6–12 words) for the product main image. Product name: "${prod.name}".`,
      system: "Return JSON only. No explanations.",
      maxOutputTokens: 256,
    });

    await sanity
      .patch(docId)
      .set({
        aiPreview: {
          event: "image_alt_rename",
          result: out,
          name: prod.name ?? null,
          createdAt: new Date().toISOString(),
          meta: null,
        },
      })
      .commit();

    return { ok: true, result: out };
  }
);
