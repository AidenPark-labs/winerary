export type MockDiary = {
  id: string;
  name: string;
  cover: string;
  memberCount?: number;
  recordCount: number;
  lastActivity: string;
  isPersonal: boolean;
};

export const diaries: MockDiary[] = [
  {
    id: "d-me",
    name: "내 와인 노트",
    cover: "https://images.unsplash.com/photo-1474722883778-792e7990302f?w=400&h=400&fit=crop",
    recordCount: 32,
    lastActivity: "오늘 담음",
    isPersonal: true,
  },
  {
    id: "d-club",
    name: "와인 동호회",
    cover: "https://images.unsplash.com/photo-1543418219-44e30b057fea?w=400&h=400&fit=crop",
    memberCount: 5,
    recordCount: 15,
    lastActivity: "2시간 전 다녀감",
    isPersonal: false,
  },
  {
    id: "d-brunch",
    name: "주말 브런치 노트",
    cover: "https://images.unsplash.com/photo-1496318447583-f524534e9ce1?w=400&h=400&fit=crop",
    memberCount: 2,
    recordCount: 8,
    lastActivity: "3일 전 다녀감",
    isPersonal: false,
  },
];
