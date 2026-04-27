/**
 * raw_payload.image_path를 절대 URL로 조립해 1건 HEAD로 200 확인.
 * CDN 호스트 여러 개 시도 + placeholder 제외 카운트.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const HOST_CANDIDATES = [
  "https://www.wine21.com",
  "https://cdn.wine21.com",
  "https://image.wine21.com",
  "https://img.wine21.com",
];

async function tryHost(host: string, path: string): Promise<number> {
  const url = host + path;
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual" });
    return res.status;
  } catch {
    return -1;
  }
}

async function main() {
  // 실제 image_path 샘플 5건
  const { data } = await sb
    .from("raw_wines")
    .select("name_ko, raw_payload")
    .eq("source", "wine21")
    .limit(20);

  const samples: { name: string; path: string }[] = [];
  for (const r of data ?? []) {
    const ip = (r.raw_payload as any)?.image_path as string | undefined;
    if (ip && !/no_image/i.test(ip)) samples.push({ name: r.name_ko ?? "(noname)", path: ip });
    if (samples.length >= 3) break;
  }

  console.log(`테스트 샘플: ${samples.length}건\n`);
  for (const s of samples) {
    console.log(`${s.name}  path=${s.path}`);
    for (const h of HOST_CANDIDATES) {
      const status = await tryHost(h, s.path);
      console.log(`  ${h}${s.path}  → ${status}`);
    }
    console.log();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
