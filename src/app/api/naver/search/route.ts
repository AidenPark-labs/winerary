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
  if (!user) return Response.json({ items: [] }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) return Response.json({ items: [] });

  const query = encodeURIComponent(q.includes("와인") ? q : q + " 와인");
  const url = "https://openapi.naver.com/v1/search/shop.json?query=" + query + "&display=6&sort=sim";

  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID!,
      "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET!,
    },
    next: { revalidate: 300 },
  });

  if (!res.ok) return Response.json({ items: [] });

  const data = await res.json();
  const items: NaverItem[] = (data.items ?? []).map((item: Record<string, string>) => ({
    title: stripHtml(item.title ?? ""),
    image: item.image ?? "",
    lprice: item.lprice ? parseInt(item.lprice) : null,
    hprice: item.hprice ? parseInt(item.hprice) : null,
    brand: item.brand || null,
    maker: item.maker || null,
    productId: item.productId ?? "",
    category4: item.category4 || null,
  }));

  return Response.json({ items });
}
