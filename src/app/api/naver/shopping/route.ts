interface NaverShoppingItem {
  title: string;
  link: string;
  image: string;
  lprice: string;
  hprice: string;
  mallName: string;
  productId: string;
  productType: string;
  brand: string;
  category1: string;
  category2: string;
  category3: string;
  category4: string;
}

// 750ml가 아닌 용량 패턴 (187ml, 375ml, 1L, 1.5L, 3L, 미니, 하프, 매그넘, 세트 등)
const NON_STANDARD_VOLUME = /187\s*ml|375\s*ml|200\s*ml|250\s*ml|500\s*ml|1[.,]5\s*[lL]|1000\s*ml|3\s*[lL]|5\s*[lL]|미니|하프|매그넘|세트|묶음|박스|[2-9]\s*병/i;

// 상품명에서 의미 있는 단어 추출 (노이즈 제거)
const NOISE_WORDS = new Set(["와인", "wine", "레드", "화이트", "로제", "스파클링", "red", "white", "rose", "sparkling", "750ml", "ml", "병"]);
function extractWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/<\/?b>/g, "")
    .replace(/[()[\]{}'"""''·\-_,./\\]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !NOISE_WORDS.has(w));
}

// 쿼리 단어가 상품명에 얼마나 포함되는지 비율 계산
function titleMatchScore(query: string, title: string): number {
  const qWords = extractWords(query);
  if (qWords.length === 0) return 1;
  const titleLower = title.toLowerCase().replace(/<\/?b>/g, "");
  let matched = 0;
  for (const w of qWords) {
    if (titleLower.includes(w)) matched++;
  }
  return matched / qWords.length;
}

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const wineId = searchParams.get("wine_id");
  if (!query) return Response.json({ error: "검색어가 필요합니다" }, { status: 400 });

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.json({ error: "네이버 API 키가 설정되지 않았습니다" }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(`"${query}"`)}&display=20&sort=sim&exclude=used:cbshop`,
      {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        },
      }
    );

    if (!res.ok) {
      console.error("[naver/shopping] API error:", res.status, await res.text());
      return Response.json({ error: "네이버 쇼핑 검색에 실패했습니다" }, { status: 502 });
    }

    const data = await res.json();
    const allItems = (data.items ?? [])
      .filter((item: NaverShoppingItem) => {
        const cats = [item.category1, item.category2, item.category3, item.category4];
        return cats.some((c) => c === "수입와인");
      })
      .map((item: NaverShoppingItem) => ({
        title: item.title.replace(/<\/?b>/g, ""),
        link: item.link,
        image: item.image,
        lprice: item.lprice ? parseInt(item.lprice) : null,
        hprice: item.hprice ? parseInt(item.hprice) : null,
        mallName: item.mallName,
        productId: item.productId,
        brand: item.brand,
        category: [item.category1, item.category2, item.category3, item.category4]
          .filter(Boolean)
          .join(" > "),
      }));

    // 유사 상품 제외: 쿼리 단어의 대부분이 상품명에 포함된 것만 유지
    // 3단어 이하 → 전부 일치 필요, 4단어 이상 → 1개까지 누락 허용
    const qWordCount = extractWords(query).length;
    const threshold = qWordCount <= 3 ? 0.99 : (qWordCount - 1) / qWordCount;
    const exactItems = allItems.filter(
      (item: { title: string }) => titleMatchScore(query, item.title) >= threshold
    );
    const relevantItems = exactItems.length > 0 ? exactItems : allItems;

    // 750ml 기준 필터링 (비표준 용량 제외)
    const standardItems = relevantItems.filter(
      (item: { title: string }) => !NON_STANDARD_VOLUME.test(item.title)
    );

    // 750ml 기준 상품이 있으면 그것만, 없으면 전체
    const items = standardItems.length > 0 ? standardItems : relevantItems;

    // 가격 범위 계산
    const prices = items
      .map((i: { lprice: number | null }) => i.lprice)
      .filter((p: number | null): p is number => p != null && p > 0);

    const priceRange = prices.length > 0
      ? { min: Math.min(...prices), max: Math.max(...prices) }
      : null;

    // wine_id가 있으면 최저가로 DB 가격 갱신
    if (wineId && priceRange) {
      const supabase = await createClient();
      supabase
        .from("wines")
        .update({ price: priceRange.min, updated_at: new Date().toISOString() })
        .eq("id", wineId)
        .then(() => {});
    }

    return Response.json({ items: items.slice(0, 10), priceRange });
  } catch (e) {
    console.error("[naver/shopping] error:", e);
    return Response.json({ error: "네이버 쇼핑 검색 중 오류가 발생했습니다" }, { status: 500 });
  }
}
