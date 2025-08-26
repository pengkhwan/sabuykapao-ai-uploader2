import { serve } from "inngest/next";
import { inngest } from "../../../src/inngest";

import {
  productTitleSuggest,
  productShortGenerate,
  productImageAltRename,
  productGalleryAltGenerate,
  articleTocGenerate,
} from "../../../src/app/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    productTitleSuggest,
    productShortGenerate,
    productImageAltRename,
    productGalleryAltGenerate,
    articleTocGenerate,
  ],
});
