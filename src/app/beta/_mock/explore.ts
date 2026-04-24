export type MockWine = {
  id: string;
  name: string;
  nameKo?: string;
  vintage: number;
  country: string;
  region?: string;
  photo: string;
  priceRange?: string;
  rating?: number;
};

export const todaysPicks: MockWine[] = [
  {
    id: "w1",
    name: "Penfolds Bin 389",
    nameKo: "펜폴즈 빈 389",
    vintage: 2019,
    country: "호주",
    region: "남호주",
    photo: "https://images.unsplash.com/photo-1584916201218-f4242ceb4809?w=400&h=600&fit=crop",
    priceRange: "8만원대",
    rating: 4.3,
  },
  {
    id: "w2",
    name: "Domaine Leflaive Bourgogne Blanc",
    nameKo: "도멘 르플레브 부르고뉴 블랑",
    vintage: 2021,
    country: "프랑스",
    region: "부르고뉴",
    photo: "https://images.unsplash.com/photo-1566754844503-4b4e5e6a6c3f?w=400&h=600&fit=crop",
    priceRange: "12만원대",
    rating: 4.5,
  },
  {
    id: "w3",
    name: "La Crema Pinot Noir",
    nameKo: "라 크레마 피노 누아",
    vintage: 2020,
    country: "미국",
    region: "소노마",
    photo: "https://images.unsplash.com/photo-1547595628-c61a29f496f0?w=400&h=600&fit=crop",
    priceRange: "5만원대",
    rating: 4.1,
  },
];

export const someday: MockWine[] = [
  {
    id: "w4",
    name: "Romanée-Conti Grand Cru",
    nameKo: "로마네 콩티",
    vintage: 2015,
    country: "프랑스",
    region: "부르고뉴",
    photo: "https://images.unsplash.com/photo-1586370434639-0fe43b2d32d6?w=400&h=600&fit=crop",
  },
  {
    id: "w5",
    name: "Sassicaia",
    nameKo: "사시카이아",
    vintage: 2018,
    country: "이탈리아",
    region: "토스카나",
    photo: "https://images.unsplash.com/photo-1598306442928-4d90f32c6866?w=400&h=600&fit=crop",
  },
  {
    id: "w6",
    name: "Dom Pérignon",
    nameKo: "돔 페리뇽",
    vintage: 2012,
    country: "프랑스",
    region: "샹파뉴",
    photo: "https://images.unsplash.com/photo-1568213816046-0ee1c42bd559?w=400&h=600&fit=crop",
  },
];

export const dictionaryTopics = [
  { id: "grape", label: "품종", hint: "까베르네 · 피노 누아 · 샤르도네" },
  { id: "region", label: "지역", hint: "보르도 · 부르고뉴 · 토스카나" },
  { id: "aroma", label: "향의 표현", hint: "베리 · 오크 · 가죽" },
];

// 친구들이 최근 높이 평가한 와인 (둘러보기 탭의 소셜 디스커버리)
export const friendsFavorites: Array<
  MockWine & { friendName: string; friendAvatar: string }
> = [
  {
    id: "ff1",
    name: "Château Margaux",
    nameKo: "샤또 마고",
    vintage: 2018,
    country: "프랑스 · 보르도",
    photo: "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=400&h=600&fit=crop",
    rating: 4.5,
    friendName: "지영",
    friendAvatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=80&h=80&fit=crop",
  },
  {
    id: "ff2",
    name: "Caymus Cabernet Sauvignon",
    nameKo: "케이머스 까베르네 소비뇽",
    vintage: 2020,
    country: "미국 · 나파밸리",
    photo: "https://images.unsplash.com/photo-1569919659476-f0852f6834b7?w=400&h=600&fit=crop",
    rating: 4.7,
    friendName: "민수",
    friendAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop",
  },
  {
    id: "ff3",
    name: "Veuve Clicquot Yellow Label",
    nameKo: "뵈브 클리코 옐로우 라벨",
    vintage: 2020,
    country: "프랑스 · 샹파뉴",
    photo: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=600&fit=crop",
    rating: 4.3,
    friendName: "지영",
    friendAvatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=80&h=80&fit=crop",
  },
];
