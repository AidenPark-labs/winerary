import { friends, currentUser, type MockFeedItem } from "./feed";

// "내가 속한 다이어리"의 기록들. 내 것(d-me) + 공유 노트(d-club, d-brunch) 포함.
// 공유 노트의 경우 작성자는 나일 수도, 친구일 수도 있음.

export type MockTimelineItem = MockFeedItem & {
  diaryId: string; // d-me | d-club | d-brunch
  isMine: boolean;
};

export const myTimeline: MockTimelineItem[] = [
  // 내 개인 노트 (내가 직접 쓴)
  {
    id: "m1",
    diaryId: "d-me",
    isMine: true,
    author: currentUser,
    section: "today",
    timeLabel: "3시간 전",
    wine: {
      name: "Penfolds Bin 389",
      nameKo: "펜폴즈 빈 389",
      vintage: 2019,
      country: "호주 · 남호주",
      photo: "https://images.unsplash.com/photo-1584916201218-f4242ceb4809?w=800&h=1000&fit=crop",
    },
    rating: 4.2,
    memo: "금요일 저녁에 혼자서. 블랙베리 향이 깊게 깔렸다.",
  },
  {
    id: "m2",
    diaryId: "d-me",
    isMine: true,
    author: currentUser,
    section: "thisWeek",
    timeLabel: "화요일",
    wine: {
      name: "La Crema Pinot Noir",
      nameKo: "라 크레마 피노 누아",
      vintage: 2020,
      country: "미국 · 소노마",
      photo: "https://images.unsplash.com/photo-1547595628-c61a29f496f0?w=800&h=1000&fit=crop",
    },
    rating: 3.8,
    memo: "치즈 플레이트랑. 가볍게 마시기 좋았다.",
  },
  {
    id: "m3",
    diaryId: "d-me",
    isMine: true,
    author: currentUser,
    section: "lastMonth",
    timeLabel: "3월 28일",
    wine: {
      name: "Cloudy Bay Sauvignon Blanc",
      nameKo: "클라우디 베이 쏘비뇽 블랑",
      vintage: 2022,
      country: "뉴질랜드 · 말보로",
      photo: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&h=1000&fit=crop",
    },
    rating: 4.1,
    memo: "라임이 싱그러워서 여름을 앞당긴 기분이었다.",
  },

  // 와인 동호회 — 내가 쓴 것 + 친구들이 쓴 것
  {
    id: "m4",
    diaryId: "d-club",
    isMine: true,
    author: currentUser,
    section: "thisWeek",
    timeLabel: "수요일",
    wine: {
      name: "Caymus Cabernet Sauvignon",
      nameKo: "케이머스 까베르네 소비뇽",
      vintage: 2020,
      country: "미국 · 나파밸리",
      photo: "https://images.unsplash.com/photo-1569919659476-f0852f6834b7?w=800&h=1000&fit=crop",
    },
    rating: 4.6,
    memo: "동호회 블라인드 테이스팅에서 1등. 여운이 길었다.",
    diaryName: "와인 동호회",
  },
  {
    id: "m5",
    diaryId: "d-club",
    isMine: false,
    author: friends[0], // 지영
    section: "today",
    timeLabel: "2시간 전",
    wine: {
      name: "Château Margaux",
      nameKo: "샤또 마고",
      vintage: 2018,
      country: "프랑스 · 보르도",
      photo: "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=800&h=1000&fit=crop",
    },
    rating: 4.5,
    memo: "초콜릿 향이 진하게 올라와서 놀랐어요.",
    diaryName: "와인 동호회",
  },
  {
    id: "m6",
    diaryId: "d-club",
    isMine: false,
    author: friends[1], // 민수
    section: "today",
    timeLabel: "5시간 전",
    wine: {
      name: "Barolo",
      nameKo: "바롤로",
      vintage: 2019,
      country: "이탈리아 · 피에몬테",
      photo: "https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=800&h=1000&fit=crop",
    },
    rating: 4.0,
    memo: "말린 체리와 가죽 향.",
    diaryName: "와인 동호회",
  },

  // 주말 브런치 노트 — 친구가 쓴 것
  {
    id: "m7",
    diaryId: "d-brunch",
    isMine: false,
    author: friends[0], // 지영
    section: "thisWeek",
    timeLabel: "3일 전",
    wine: {
      name: "Veuve Clicquot Yellow Label",
      nameKo: "뵈브 클리코 옐로우 라벨",
      vintage: 2020,
      country: "프랑스 · 샹파뉴",
      photo: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=800&h=1000&fit=crop",
    },
    rating: 4.3,
    memo: "브런치 자리에서 한 잔. 작은 거품이 기분 좋게 올라왔다.",
    diaryName: "주말 브런치 노트",
  },
];
