import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.winerary.app",
  appName: "Winerary",
  // 웹뷰가 Vercel 배포 사이트를 바라봄 (로컬 정적 파일 X)
  server: {
    url: "https://winerary.vercel.app",
    cleartext: false,
  },
  android: {
    // 상태바/내비게이션바 설정
    backgroundColor: "#ffffff",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
