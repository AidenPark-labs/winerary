export async function GET() {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;

  if (!id || !secret) {
    return Response.json({ ok: false, reason: "환경변수 없음", id: !!id, secret: !!secret });
  }

  const params = new URLSearchParams({ query: "샤또 마고 와인", display: "3", sort: "sim" });
  const res = await fetch("https://openapi.naver.com/v1/search/shop.json?" + params, {
    headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
    cache: "no-store",
  });

  const body = await res.text();
  return Response.json({ ok: res.status === 200, status: res.status, body: body.slice(0, 500) });
}
