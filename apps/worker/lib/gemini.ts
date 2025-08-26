// apps/worker/lib/gemini.ts
import type { SchemaObject } from "ajv"; // type only (ไม่ต้องติดตั้งเพิ่มก็ได้ ถ้าไม่มีจะถือเป็น any)
import { VertexAI } from "@google-cloud/vertexai";

type GenJSONOpts = {
  schema: SchemaObject | any;
  prompt?: string;
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
};

// NOTE:
// - โหมด MOCK: ตั้ง AI_MOCK=1 (ค่าแนะนำตอน dev) -> จะคืน example จาก schema หรือ dummy แทน
// - โหมดจริง: ต้องมี GCP creds และ ENV `GEMINI_MODEL_TEXT`, `GEMINI_LOCATION` (มีค่า default ให้)

const DEFAULT_MODEL = process.env.GEMINI_MODEL_TEXT || "gemini-2.5-pro-001";
const DEFAULT_LOCATION = process.env.GEMINI_LOCATION || "global";
const DEFAULT_TEMP = Number(process.env.TEMP_TEXT || 0.6);
const DEFAULT_MAX = Number(process.env.MAX_OUT_TOKENS_TEXT || 1024);

function mockFromSchema<T>(schema: any): T {
  try {
    if (schema?.example) {
      return JSON.parse(schema.example) as T;
    }
  } catch {}
  // fallback mock สำหรับเคสไม่มี example
  return {
    titles: [
      "กระเป๋าหนังวัวแท้ ทรงมินิ ใช้ทุกวัน",
      "Mini Leather Wallet – Hand-stitched",
      "Compact Cowhide Wallet, Everyday Use",
    ],
    short_description:
      "กระเป๋าหนังวัวแท้ดีไซน์มินิมอล น้ำหนักเบา ใช้ได้ทุกวัน เหมาะพกพา",
    meta_description:
      "กระเป๋าหนังวัวแท้ทรงมินิมอล ใช้งานได้ทุกวัน น้ำหนักเบา ทนทาน เหมาะกับทุกสไตล์ (140–160 ตัวอักษร)",
  } as unknown as T;
}

export async function generateJSON<T = unknown>({
  schema,
  prompt,
  system,
  maxOutputTokens = DEFAULT_MAX,
  temperature = DEFAULT_TEMP,
}: GenJSONOpts): Promise<T> {
  // 1) MOCK mode หรือยังไม่มี creds -> คืนตัวอย่างทันที ป้องกันอินิต SDK ทำให้ route ล้ม
  if (process.env.AI_MOCK === "1" || !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return mockFromSchema<T>(schema);
  }

  // 2) โหมดจริง: เรียก Vertex AI แบบ lazy
  try {
    const vertex = new VertexAI({ location: DEFAULT_LOCATION });
    const model = vertex.getGenerativeModel({
      model: DEFAULT_MODEL,
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: "application/json",
        // @ts-ignore: vertex accepts a JSON schema here
        responseSchema: schema,
      },
      systemInstruction: system ? { role: "system", parts: [{ text: system }] } : undefined,
    });

    const userText =
      prompt ||
      "Produce a JSON object strictly following the provided JSON Schema. Do not include extra fields.";
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userText }] }],
    });

    // vertex SDK: รวมข้อความไว้ที่ response.text()
    // แต่เผื่อบางเวอร์ชัน ใช้ parts[0].text
    // @ts-ignore
    const text: string =
      (result?.response?.text && result.response.text()) ||
      // @ts-ignore
      result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "";

    const parsed = JSON.parse(text) as T;
    return parsed;
  } catch (err) {
    // ถ้าเรียกจริงแล้วพัง ให้ fallback เป็น mock เพื่อไม่ให้ route ล้ม
    console.warn("[gemini] fallback to mock due to error:", (err as any)?.message || err);
    return mockFromSchema<T>(schema);
  }
}
