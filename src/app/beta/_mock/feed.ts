export type MockFriend = {
  id: string;
  nickname: string;
  avatar: string;
};

export type MockFeedItem = {
  id: string;
  author: MockFriend;
  section: "today" | "thisWeek" | "lastMonth";
  timeLabel: string;
  wine: {
    name: string;
    nameKo?: string;
    vintage: number;
    country: string;
    photo: string;
  };
  rating: number;
  memo: string;
  diaryName?: string;
};

export const friends: MockFriend[] = [
  {
    id: "u-ji",
    nickname: "지영",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop",
  },
  {
    id: "u-mn",
    nickname: "민수",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop",
  },
  {
    id: "u-hw",
    nickname: "현우",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&h=120&fit=crop",
  },
  {
    id: "u-sy",
    nickname: "소연",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=120&fit=crop",
  },
  {
    id: "u-hr",
    nickname: "혜리",
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&h=120&fit=crop",
  },
  {
    id: "u-jh",
    nickname: "지혜",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=120&h=120&fit=crop",
  },
];

const me: MockFriend = {
  id: "me",
  nickname: "민지",
  avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop",
};

export const currentUser = me;

export const feed: MockFeedItem[] = [
  {
    id: "f1",
    author: friends[0],
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
    memo: "초콜릿 향이 진하게 올라와서 놀랐어요. 탄닌도 부드러워서 스테이크랑 정말 잘 어울렸음.",
    diaryName: "와인 동호회",
  },
  {
    id: "f2",
    author: friends[1],
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
    memo: "말린 체리와 가죽 향. 좀 더 디캔팅할 걸 그랬나 싶긴 하지만 여전히 멋졌다.",
  },
  {
    id: "f3",
    author: friends[2],
    section: "thisWeek",
    timeLabel: "어제",
    wine: {
      name: "Cloudy Bay Sauvignon Blanc",
      nameKo: "클라우디 베이 쏘비뇽 블랑",
      vintage: 2022,
      country: "뉴질랜드 · 말보로",
      photo: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&h=1000&fit=crop",
    },
    rating: 4.2,
    memo: "라임이랑 패션프루트의 산뜻함. 여름 저녁에 딱이었어요.",
  },
  {
    id: "f4",
    author: friends[0],
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
  {
    id: "f5",
    author: friends[1],
    section: "lastMonth",
    timeLabel: "3주 전",
    wine: {
      name: "Caymus Cabernet Sauvignon",
      nameKo: "케이머스 까베르네 소비뇽",
      vintage: 2020,
      country: "미국 · 나파밸리",
      photo: "https://images.unsplash.com/photo-1569919659476-f0852f6834b7?w=800&h=1000&fit=crop",
    },
    rating: 4.7,
    memo: "잘 익은 블랙베리와 바닐라 향. 여운이 길었어요.",
    diaryName: "와인 동호회",
  },
];

export const hintCard = {
  friend: friends[0],
  wineName: "바롤로 2019",
  message: "도 이 와인을 좋아하셨대요",
};

export const pendingFriendRequests = 2;
