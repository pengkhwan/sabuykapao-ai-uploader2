// libs/ai/gemini.ts
// โหมด Mock: คืนค่า example จาก schema เลย (ยังไม่เรียก Vertex จริง)

export async function generateJSON<T>({
  schema,
}: {
  schema: any; // JSON Schema with .example (string)
}): Promise<T> {
  const mock = process.env.AI_MOCK === "1";
  if (mock) {
    return JSON.parse(schema.example || "{}") as T;
  }
  // เปิดจริงค่อยต่อ Vertex AI
  throw new Error("Non-mock generation not implemented yet.");
}
