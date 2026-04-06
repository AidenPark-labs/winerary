interface NaverLocalItem {
  title: string;
  category: string;
  address: string;
  roadAddress: string;
  mapx: string;
  mapy: string;
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
      `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5&sort=random`,
      {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        },
      }
    );

    if (!res.ok) {
      console.error("[naver/local] API error:", res.status);
      return Response.json({ error: "네이버 장소 검색에 실패했습니다" }, { status: 502 });
    }

    const data = await res.json();
    const items = (data.items ?? []).map((item: NaverLocalItem) => {
      const lat = parseInt(item.mapy) / 1e7;
      const lng = parseInt(item.mapx) / 1e7;
      return {
        title: item.title.replace(/<\/?b>/g, ""),
        category: item.category,
        address: item.roadAddress || item.address,
        lat,
        lng,
      };
    });

    return Response.json({ items });
  } catch (e) {
    console.error("[naver/local] error:", e);
    return Response.json({ error: "장소 검색 중 오류가 발생했습니다" }, { status: 500 });
  }
}
