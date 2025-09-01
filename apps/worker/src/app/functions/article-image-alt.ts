// apps/worker/src/app/functions/article-image-alt.ts
// Inngest: Generate ALT (preview) for Article featured image + inline body images
// Contract: writes preview to aiPreview.result.imageAlts { featured?, body? } — no actual apply here.

import { inngest } from "../../inngest";
import { sanity } from "../../../lib/sanity"; // <- server-side Sanity client (ไม่มี /src/)
import type { SanityDocumentStub } from "@sanity/client";

type AltPreview = {
  featured?: { alt: string };
  body?: { items: Array<{ key: string; alt: string }> };
};

function toPub(id?: string) {
  return id && id.startsWith("drafts.") ? id.slice(7) : id || "";
}

export const articleImageAltGenerate = inngest.createFunction(
  { id: "ai/article.image_alt_generate" },
  { event: "ai/article.image_alt_generate" },
  async ({ event, step }) => {
    const docIdRaw = (event.data as any)?.docId as string | undefined;
    const userId = ((event.data as any)?.meta?.userId as string) || "system";
    const docId = toPub(docIdRaw);

    if (!docId) {
      return { ok: false, error: "Missing docId" };
    }

    // 1) Fetch article essentials
    const doc = await step.run("fetch-article", async () => {
      const query = `
        *[_id == $id][0]{
          _id,
          title,
          "hasFeatured": defined(featuredImage.asset),
          featuredImage{
            alt,
            caption
          },
          // only pick image nodes to keep payload small
          "bodyImages": body[_type == "image"]{
            _key,
            alt,
            caption
          }
        }
      `;
      return sanity.fetch(query, { id: docId });
    });

    if (!doc?._id) {
      return { ok: false, error: "Article not found" };
    }

    const title: string = doc.title || "";
    const hasFeatured: boolean = !!doc.hasFeatured;
    const bodyImages: Array<{ _key: string; alt?: string; caption?: string }> =
      Array.isArray(doc.bodyImages) ? doc.bodyImages : [];

    // 2) Build preview alts (mock logic for now — no external AI key required)
    const preview: AltPreview = {};

    // Featured ALT (if article has featured image)
    if (hasFeatured) {
      // Simple heuristic using title/caption
      const base = title?.trim() ? title.trim() : "บทความ";
      const cap = doc.featuredImage?.caption?.trim();
      // Keep it concise, SEO-friendly, and readable in Thai if title is Thai
      const alt =
        cap && cap.length > 0
          ? `${base} — ${cap}`
          : `ภาพประกอบ: ${base}`;
      preview.featured = { alt };
    }

    // Body images ALT
    if (bodyImages.length) {
      preview.body = {
        items: bodyImages.map((img, idx) => {
          const base = title?.trim() ? title.trim() : "บทความ";
          const n = idx + 1;
          const cap = img.caption?.trim();
          // favor caption; otherwise derive from title + order
          const alt =
            cap && cap.length > 0
              ? `${cap}`
              : `${base} — รูปภาพที่ ${n}`;
          return { key: img._key, alt };
        }),
      };
    }

    // 3) Write preview to aiPreview.result.imageAlts
    const now = new Date().toISOString();
    const patch: SanityDocumentStub = {
      _id: docId,
      _type: "article",
    } as any;

    await step.run("write-preview", async () => {
      return sanity
        .patch(docId)
        .set({
          "aiPreview.event": "article_image_alt_generate",
          "aiPreview.createdAt": now,
          "aiPreview.meta": { userId },
          "aiPreview.result.imageAlts": preview,
        })
        .commit({ autoGenerateArrayKeys: true, returnIds: true });
    });

    return {
      ok: true,
      docId,
      featured: preview.featured ? true : false,
      bodyCount: preview.body?.items?.length || 0,
      now,
    };
  }
);
