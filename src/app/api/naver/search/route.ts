import { createClient } from "@/lib/supabase/server";

export interface NaverItem {
  title: string;
  image: string;
  lprice: number | null;
  hprice: number | null;
  brand: string | null;
  maker: string | null;
  productId: string;
  category4: string | null;
}

function stripHtml(str: string) {
  return str.replace(/<[^>]*>/g, "");
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ items: [], error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) return Response.json({ items: [] });

  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    console.error("[naver/search] NAVER_CLIENT_ID or NAVER_CLIENT_SECRET not set");
    return Response.json({ items: [], error: "Naver API credentials not configured" });
  }

  const params = new URLSearchParams({
    query: q.includes("와인") ? q : q + " 와인",
    display: "6",
    sort: "sim",
  });

  const res = await fetch(
    "https://openapi.naver.com/v1/search/shop.json?" + params.toString(),
    {
      headers: {
        "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const body = await res.text();
    console.error("[naver/search] API error", res.status, body);
    return Response.json({ items: [], error: `Naver API ${res.status}: ${body}` });
  }

  const data = await res.json();
  const items: NaverItem[] = (data.items ?? []).map((item: Record<string, string>) => ({
    title: stripHtml(item.title ?? ""),
    image: item.image ?? "",
    lprice: item.lprice ? parseInt(item.lprice) : null,
    hprice: item.hprice ? parseInt(item.hprice) : null,
    brand: item.brand || null,
    maker: item.maker || null,
    productId: item.productId ?? String(Math.random()),
    category4: item.category4 || null,
  }));

  return Response.json({ items });
}
