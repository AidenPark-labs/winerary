import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic();

const PROMPT = [
  "Read every piece of text visible on this wine label exactly as written.",
  "Include wine name, producer, vintage year, region, grape varieties, alcohol %, volume.",
  "Do NOT translate — return original language text only.",
  "Return only the raw text, line by line.",
].join(" ");

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File;
  if (!file) return Response.json({ error: "No file" }, { status: 400 });

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
  type MT = typeof allowed[number];
  const mediaType: MT = (allowed as readonly string[]).includes(file.type) ? file.type as MT : "image/jpeg";

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 400,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: PROMPT },
      ],
    }],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw_text = block?.type === "text" ? block.text : "";
  return Response.json({ raw_text });
}
