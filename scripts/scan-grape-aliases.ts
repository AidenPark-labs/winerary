/**
 * wines.name_ko에서 품종 표기 변형을 찾아 빈도 집계 (READ-ONLY)
 *
 * term_dict의 grape 엔트리와 대조하여 "정답 ko / 현재 aliases / 발견된 변형" 비교.
 * 임계값 이상의 변형만 aliases 추가 대상으로 분류해 출력.
 *
 * 실행: NODE_ENV=development npx tsx scripts/scan-grape-aliases.ts
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// 수동 정의: term_dict의 정답 ko와 후보 변형 표기
// 각 그룹의 [0]이 현재 term_dict.ko 값, 나머지가 변형 후보.
const GROUPS: Array<{ en: string; ko: string; variants: string[] }> = [
  {
    en: "Cabernet Sauvignon",
    ko: "까베르네 소비뇽",
    variants: ["카베르네 소비뇽", "까베르네 쇼비뇽", "카베르네 쇼비뇽", "카버네 소비뇽", "카버네 쇼비뇽", "캬베르네 소비뇽"],
  },
  { en: "Cabernet Franc", ko: "까베르네 프랑", variants: ["카베르네 프랑", "카버네 프랑"] },
  { en: "Sauvignon Blanc", ko: "소비뇽 블랑", variants: ["쇼비뇽 블랑"] },
  { en: "Carmenère", ko: "까르메네르", variants: ["카르메네르", "까르미네르", "카르미네르", "카르메네"] },
  { en: "Syrah", ko: "시라", variants: ["쉬라", "쉬라즈"] },
  { en: "Chardonnay", ko: "샤르도네", variants: ["샤도네", "샤르도네이", "샤도네이"] },
  { en: "Merlot", ko: "메를로", variants: ["메를롯", "멀롯", "멀로"] },
  { en: "Pinot Noir", ko: "피노 누아", variants: ["피노누아", "피노 느와", "삐노 누아", "삐노누아"] },
  { en: "Pinot Grigio", ko: "피노 그리지오", variants: ["피노 그리조", "삐노 그리지오"] },
  { en: "Riesling", ko: "리슬링", variants: ["리즐링"] },
  { en: "Malbec", ko: "말벡", variants: ["말백"] },
  { en: "Tempranillo", ko: "템프라니요", variants: ["템프라닐로", "뗌프라니요"] },
  { en: "Grenache", ko: "그르나슈", variants: ["그레나쉬", "그레나슈", "가르나차"] },
  { en: "Nebbiolo", ko: "네비올로", variants: ["네비올", "네비올로"] },
  { en: "Sangiovese", ko: "산지오베제", variants: ["산죠베제", "산지오베지"] },
  { en: "Gewürztraminer", ko: "게뷔르츠트라미너", variants: ["게뷔르츠트라미네", "게부르츠트라미너"] },
  { en: "Viognier", ko: "비오니에", variants: ["비오니에르"] },
  { en: "Zinfandel", ko: "진판델", variants: ["진판뎰"] },
];

async function countInNameKo(term: string): Promise<number> {
  const { count } = await sb
    .from("wines")
    .select("*", { count: "exact", head: true })
    .ilike("name_ko", `%${term}%`);
  return count ?? 0;
}

async function main() {
  console.log("═══ wines.name_ko 품종 변형 빈도 스캔 ═══\n");

  // term_dict 현재 상태 로드
  const { data: dict } = await sb
    .from("term_dict")
    .select("en, ko, aliases")
    .eq("category", "grape");
  const dictMap = new Map<string, { ko: string; aliases: string[] }>();
  for (const d of dict ?? []) {
    dictMap.set((d.en as string).toLowerCase(), {
      ko: d.ko as string,
      aliases: (Array.isArray(d.aliases) ? d.aliases : []) as string[],
    });
  }

  type Finding = { en: string; ko: string; currentAliases: string[]; newVariants: Array<{ text: string; count: number }> };
  const findings: Finding[] = [];

  for (const g of GROUPS) {
    const entry = dictMap.get(g.en.toLowerCase());
    if (!entry) {
      console.log(`⚠ term_dict에 없음: ${g.en} — skip\n`);
      continue;
    }
    const known = new Set<string>([entry.ko.toLowerCase(), ...entry.aliases.map((a) => a.toLowerCase())]);
    const newVariants: Array<{ text: string; count: number }> = [];
    for (const v of g.variants) {
      if (known.has(v.toLowerCase())) continue; // 이미 등록됨
      const count = await countInNameKo(v);
      if (count > 0) newVariants.push({ text: v, count });
    }
    if (newVariants.length) {
      findings.push({
        en: g.en,
        ko: entry.ko,
        currentAliases: entry.aliases,
        newVariants: newVariants.sort((a, b) => b.count - a.count),
      });
    }
  }

  // 출력
  let totalNew = 0;
  for (const f of findings) {
    console.log(`【${f.en}】  정답 ko: "${f.ko}"`);
    console.log(`  현재 aliases(${f.currentAliases.length}): [${f.currentAliases.join(", ")}]`);
    console.log(`  추가 후보:`);
    for (const v of f.newVariants) {
      console.log(`    "${v.text}"  ${v.count}건`);
      totalNew++;
    }
    console.log();
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`영향 품종: ${findings.length}개, 추가 후보 변형: ${totalNew}개\n`);

  // 추천: 임계값 5건 이상만 추가할 것을 제안
  console.log("【임계값 5건 이상만 추가할 경우】");
  for (const f of findings) {
    const kept = f.newVariants.filter((v) => v.count >= 5);
    if (!kept.length) continue;
    console.log(`  ${f.en}: + [${kept.map((v) => `"${v.text}"(${v.count})`).join(", ")}]`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
