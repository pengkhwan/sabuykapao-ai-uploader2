import { inngest } from "../../inngest";
import { sanity } from "../../../lib/sanity";
import { generateJSON } from "../../../lib/gemini";

type TocItem = { text: string; anchor: string };
type TocOut = { toc: TocItem[] };

const toPub = (id?: string) =>
  id && id.startsWith("drafts.") ? id.slice(7) : id || "";

export const articleTocGenerate = inngest.createFunction(
  { id: "ai.article.toc_generate" },
  { event: "ai/article.toc_generate" },
  async ({ event }) => {
    const { docId, bodyPreview, max = 8, meta } = (event.data ?? {}) as {
      docId?: string;
      bodyPreview?: string;
      max?: number;
      meta?: any;
    };

    const pubId = toPub(docId);
    if (!pubId) {
      console.error("[article-toc] missing docId in event", event.data);
      throw new Error("docId is required");
    }

    console.log("[article-toc] received", { pubId, max, hasPreview: !!bodyPreview });

    // JSON schema for structured output
    const schema = {
      type: "object",
      properties: {
        toc: {
          type: "array",
          maxItems: max,
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              anchor: { type: "string" },
            },
            required: ["text", "anchor"],
            additionalProperties: false,
          },
        },
      },
      required: ["toc"],
      additionalProperties: false,
      example: JSON.stringify({
        toc: [
          { text: "บทนำ", anchor: "intro" },
          { text: "หัวข้อสำคัญ", anchor: "key-points" },
          { text: "สรุป", anchor: "summary" },
        ],
      }),
    };

    // 1) เรียกโมเดล (หรือคืน mock ตาม AI_MOCK)
    let out: TocOut;
    try {
      out = await generateJSON<TocOut>({
        schema,
        input: bodyPreview || "",
      });
    } catch (e) {
      console.error("[article-toc] generateJSON error", e);
      // เผื่อไว้: fallback เบาๆ เพื่อไม่ให้งานล้ม
      out = {
        toc: [
          { text: "บทนำ", anchor: "intro" },
          { text: "หัวข้อสำคัญ", anchor: "key-points" },
          { text: "สรุป", anchor: "summary" },
        ],
      };
    }

    // 2) แพตช์ผลไปที่เอกสาร (เก็บไว้ที่ aiPreview)
    try {
      const res = await sanity
        .patch(pubId)
        .set({
          aiPreview: {
            event: "toc_generate",
            result: out,
            createdAt: new Date().toISOString(),
            meta: meta ?? null,
          },
        })
        .commit({ autoGenerateArrayKeys: true });

      console.log("[article-toc] patched OK", { resId: (res as any)?._id });
      return { ok: true, result: out };
    } catch (e) {
      console.error("[article-toc] patch error", e);
      throw e;
    }
  }
);
