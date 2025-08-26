import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "sabuykapao-worker",          // ⬅️ ใส่ id ให้ instance
  name: "SabuyKapao Worker",
  eventKey: process.env.INNGEST_EVENT_KEY || "dev", // ใช้ค่า dev ระหว่าง local
});
