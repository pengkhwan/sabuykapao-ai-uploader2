// apps/worker/app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "../../../src/inngest";

import {
  productTitleSuggest,
  productShortGenerate,
  productImageAltRename,
  productGalleryAltGenerate,
  articleTocGenerate,
  articleImageAltGenerate, // ⬅️ เพิ่ม handler สำหรับ ALT ของบทความ
} from "../../../src/app/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    productTitleSuggest,
    productShortGenerate,
    productImageAltRename,
    productGalleryAltGenerate,
    articleTocGenerate,
    articleImageAltGenerate, // ⬅️ ลงทะเบียนฟังก์ชันให้ Inngest ใช้งาน
  ],
});
