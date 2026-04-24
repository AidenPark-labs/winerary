export type MockPublicUser = {
  id: string;
  nickname: string;
  bio: string;
  avatar: string;
  recentWine: {
    name: string;
    nameKo: string;
    vintage: number;
    photo: string;
    rating: number;
  };
};

export const publicUsers: MockPublicUser[] = [
  {
    id: "p-soyeon",
    nickname: "소연",
    bio: "주말 저녁의 한 잔을 남겨요",
    avatar:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=120&fit=crop",
    recentWine: {
      name: "Penfolds Bin 389",
      nameKo: "펜폴즈 빈 389",
      vintage: 2019,
      photo:
        "https://images.unsplash.com/photo-1584916201218-f4242ceb4809?w=600&h=800&fit=crop",
      rating: 4.3,
    },
  },
  {
    id: "p-hyeri",
    nickname: "혜리",
    bio: "천천히 배우는 중",
    avatar:
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&h=120&fit=crop",
    recentWine: {
      name: "Cloudy Bay Sauvignon Blanc",
      nameKo: "클라우디 베이 쏘비뇽 블랑",
      vintage: 2022,
      photo:
        "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&h=800&fit=crop",
      rating: 4.1,
    },
  },
  {
    id: "p-jihye",
    nickname: "지혜",
    bio: "이탈리아 와인을 좋아해요",
    avatar:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=120&h=120&fit=crop",
    recentWine: {
      name: "Barolo",
      nameKo: "바롤로",
      vintage: 2019,
      photo:
        "https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=600&h=800&fit=crop",
      rating: 4.4,
    },
  },
  {
    id: "p-eunji",
    nickname: "은지",
    bio: "스파클링 수집가",
    avatar:
      "https://images.unsplash.com/photo-1488716820095-cbe80883c496?w=120&h=120&fit=crop",
    recentWine: {
      name: "Veuve Clicquot Yellow Label",
      nameKo: "뵈브 클리코 옐로우 라벨",
      vintage: 2020,
      photo:
        "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&h=800&fit=crop",
      rating: 4.5,
    },
  },
  {
    id: "p-minseo",
    nickname: "민서",
    bio: "기분 좋은 날의 한 잔",
    avatar:
      "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=120&h=120&fit=crop",
    recentWine: {
      name: "La Crema Pinot Noir",
      nameKo: "라 크레마 피노 누아",
      vintage: 2020,
      photo:
        "https://images.unsplash.com/photo-1547595628-c61a29f496f0?w=600&h=800&fit=crop",
      rating: 4.0,
    },
  },
];
