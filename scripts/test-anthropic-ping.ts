import { config } from "dotenv";
config({ path: ".env.local" });
import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const key = process.env.ANTHROPIC_API_KEY ?? "";
  console.log("key prefix:", key.slice(0, 15), "...", key.slice(-4));
  console.log("key length:", key.length);

  const client = new Anthropic();
  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 20,
      messages: [{ role: "user", content: "say ok" }],
    });
    console.log("OK");
    console.log("  model:", res.model);
    console.log("  usage:", res.usage);
    console.log("  content:", JSON.stringify(res.content));
  } catch (e) {
    const err = e as { status?: number; message?: string; error?: unknown };
    console.log("FAIL");
    console.log("  status:", err.status);
    console.log("  message:", err.message);
    console.log("  full:", JSON.stringify(err, null, 2).slice(0, 800));
  }
}
main().catch(console.error);
