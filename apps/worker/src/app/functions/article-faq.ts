// apps/worker/src/app/functions/article-faq.ts
import type { Inngest } from "inngest";
import { sanity } from "../../../lib/sanity";

type EventData = {
  docId: string;
  max?: number;
  meta?: { userId?: string; lang?: string; tone?: string };
};

type FaqItem = { question: string; answer: string };

function toPub(id: string) {
  return id?.startsWith("drafts.") ? id.slice("drafts.".length) : id;
}

/* ---------------- util: clean / dedup / clamp ---------------- */
const clamp = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
function normalizeFaq(items: FaqItem[], opts?: { maxQ?: number; maxA?: number }) {
  const seen = new Set<string>();
  const maxQ = opts?.maxQ ?? 140;
  const maxA = opts?.maxA ?? 600;
  const out: FaqItem[] = [];
  for (const it of items || []) {
    const q = clamp(String(it?.question || "").trim(), maxQ);
    const a = clamp(String(it?.answer || "").trim(), maxA);
    if (!q || !a) continue;
    const key = q.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ question: q, answer: a });
  }
  return out;
}

/* ---------------- naive fallback (ถ้าไม่ตั้งค่า AI KEY) ---------------- */
function naiveGenerateFaq(input: {
  title?: string;
  excerpt?: string;
  bodyText?: string;
  limit: number;
  lang?: string;
}): FaqItem[] {
  const title = (input.title || "").trim();
  const excerpt = (input.excerpt || "").trim();
  const body = (input.bodyText || "").trim();
  const base = title || (input.lang?.startsWith("en") ? "this article" : "บทความนี้");
  const TH = !input.lang || input.lang.startsWith("th");

  const items: FaqItem[] = [
    {
      question: TH ? `${base}เกี่ยวกับอะไร?` : `What is ${base} about?`,
      answer:
        excerpt ||
        (TH
          ? `สรุปย่อ: ${base}ครอบคลุมประเด็นสำคัญและแนวคิดหลักที่ผู้อ่านควรรู้`
          : `Summary: ${base} covers key points and practical insights.`),
    },
    {
      question: TH ? `ประเด็นสำคัญของ${base}คืออะไรบ้าง?` : `What are the key takeaways from ${base}?`,
      answer: excerpt || (body ? clamp(body, 160) : TH ? "มีหัวข้อหลักหลายประการที่ควรทราบ" : "Several key points."),
    },
    {
      question: TH ? `ใครควรอ่าน${base}?` : `Who should read ${base}?`,
      answer: TH
        ? "ผู้อ่านที่ต้องการเข้าใจภาพรวมและแนวทางปฏิบัติจากบทความนี้"
        : "Readers seeking a concise overview and actionable guidance.",
    },
    {
      question: TH ? `${base}มีแนวทางแนะนำอย่างไร?` : `What are the recommended steps from ${base}?`,
      answer: body ? clamp(body, 200) : TH ? "บทความนี้แนะนำหลักการและตัวอย่างเพื่อประยุกต์ใช้" : "It suggests principles and examples.",
    },
    {
      question: TH ? "ข้อควรระวัง/คำแนะนำเพิ่มเติม?" : "Any caveats or additional tips?",
      answer: TH ? "ควรทดสอบกับเคสจริง และอัปเดตข้อมูลตามบริบทล่าสุด" : "Test with real cases and keep content up-to-date.",
    },
  ];

  return normalizeFaq(items, { maxQ: 140, maxA: 600 }).slice(0, Math.max(1, input.limit || 5));
}

/* ---------------- LLM provider (OpenAI-compatible) ----------------
   - ตั้งค่า ENV:
     OPENAI_API_KEY=sk-xxxx
     OPENAI_MODEL=gpt-4o-mini   (หรือโมเดล chat อื่น)
   - ถ้าไม่ตั้งค่า -> จะ fallback เป็น naive โดยอัตโนมัติ
-------------------------------------------------------------------*/
async function generateFaqWithLLM(payload: {
  title?: string;
  excerpt?: string;
  bodyText?: string;
  limit: number;
  lang?: string;   // "th" | "en" | ...
  tone?: string;   // เช่น "concise", "friendly"
}): Promise<FaqItem[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!apiKey) return null; // ไม่มีคีย์ → ให้ fallback ภายนอก

  // สร้าง system/user prompt ให้คืน JSON เท่านั้น
  const lang = payload.lang || "th";
  const limit = Math.max(1, Math.min(10, payload.limit || 5));
  const system = `You are a helpful assistant generating concise FAQ for an article.
Return ONLY valid JSON array of objects with keys: "question", "answer".
No markdown, no explanations. Language: ${lang}. Tone: ${payload.tone || "concise"}.
Constraints: question <= 140 chars, answer <= 600 chars, ${limit} items max, no duplicates.`;
  const content = [
    `Title: ${payload.title || "-"}`,
    `Excerpt: ${payload.excerpt || "-"}`,
    `Body (first 200 tokens): ${payload.bodyText || "-"}`,
    `Please generate ${limit} Q&A.`,
  ].join("\n");

  // เรียก OpenAI Chat Completions (compatible)
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    // ปล่อยให้ fallback ภายนอกตัดสินใจ
    return null;
  }
  const json = await res.json().catch(() => null);
  const text: string | undefined = json?.choices?.[0]?.message?.content;

  // พยายาม parse JSON
  try {
    const parsed = JSON.parse((text || "").trim());
    if (!Array.isArray(parsed)) return null;
    const items = parsed
      .map((v: any) => ({ question: String(v?.question || ""), answer: String(v?.answer || "") }))
      .filter((v: FaqItem) => v.question && v.answer);

    return normalizeFaq(items, { maxQ: 140, maxA: 600 }).slice(0, limit);
  } catch {
    // ถ้าโมเดลคืนไม่ใช่ JSON ล้วน → fallback
    return null;
  }
}

/* ---------------- write preview ลง aiPreview.result.faq[] ---------------- */
async function writeFaqPreview(docIdPub: string, items: FaqItem[], userId?: string) {
  const now = new Date().toISOString();
  return sanity
    .patch(docIdPub)
    .set({
      aiPreview: {
        event: "faq_generate",
        createdAt: now,
        meta: { userId: userId || "worker" },
        result: { faq: items },
      },
    })
    .commit({ autoGenerateArrayKeys: true });
}

/* ---------------- Inngest function ---------------- */
export const articleFaqGenerate = (inngest: Inngest) =>
  inngest.createFunction(
    { id: "ai/article.faq_generate" },
    { event: "ai/article.faq_generate" },
    async ({ event, step }) => {
      const data = (event.data || {}) as EventData;
      const pubId = toPub(String(data.docId || ""));
      const limit = typeof data.max === "number" ? Math.max(1, Math.min(10, data.max)) : 5;
      const lang = data.meta?.lang || "th";
      const tone = data.meta?.tone || "concise";

      if (!pubId) throw new Error("Missing docId");

      // 1) โหลดบทความ (เอาเฉพาะที่จำเป็น)
      const article = await step.run("fetch-article", async () => {
        const q = `*[_id == $id][0]{
          title, excerpt,
          "bodyText": string::join(string::split(pt::text(body[]), /\\s+/)[0..200], " ")
        }`;
        return sanity.fetch(q, { id: pubId });
      });

      // 2) Generate ด้วย LLM (ถ้าใช้ได้) หรือ fallback
      const items = await step.run("generate-faq", async () => {
        const llm = await generateFaqWithLLM({
          title: article?.title,
          excerpt: article?.excerpt,
          bodyText: article?.bodyText,
          limit,
          lang,
          tone,
        });
        if (llm && llm.length) return llm;
        return naiveGenerateFaq({
          title: article?.title,
          excerpt: article?.excerpt,
          bodyText: article?.bodyText,
          limit,
          lang,
        });
      });

      // 3) เขียน preview
      const res = await step.run("write-preview", async () =>
        writeFaqPreview(pubId, items, data.meta?.userId)
      );

      return { ok: true, docId: pubId, count: items.length, resId: res?._id || pubId };
    }
  );
