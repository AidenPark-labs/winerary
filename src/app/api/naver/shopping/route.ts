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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  if (!query) return Response.json({ error: "검색어가 필요합니다" }, { status: 400 });

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.json({ error: "네이버 API 키가 설정되지 않았습니다" }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(`"${query}"`)}&display=10&sort=sim&exclude=used:cbshop`,
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
    const items = (data.items ?? [])
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

    return Response.json({ items });
  } catch (e) {
    console.error("[naver/shopping] error:", e);
    return Response.json({ error: "네이버 쇼핑 검색 중 오류가 발생했습니다" }, { status: 500 });
  }
}
