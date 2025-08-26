import { createClient } from "@sanity/client";

// ✅ เพิ่มบรรทัดนี้
console.log(
  "[sanity env]",
  "projectId=", process.env.SANITY_PROJECT_ID,
  "dataset=", process.env.SANITY_DATASET,
  "tokenPresent=", !!process.env.SANITY_TOKEN
);

export const sanity = createClient({
  projectId: process.env.SANITY_PROJECT_ID!,
  dataset: process.env.SANITY_DATASET!,
  apiVersion: "2025-01-01",
  token: process.env.SANITY_TOKEN!,
  useCdn: false,
});
