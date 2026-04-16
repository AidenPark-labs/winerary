import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

/**
 * 네이티브 앱에서만 푸시 알림을 초기화합니다.
 * 웹에서는 아무 동작도 하지 않습니다.
 */
export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return;

  await PushNotifications.register();

  PushNotifications.addListener("registration", (token) => {
    // FCM 토큰을 서버에 저장
    savePushToken(token.value);
  });

  PushNotifications.addListener("registrationError", (error) => {
    console.error("Push registration error:", error);
  });

  PushNotifications.addListener(
    "pushNotificationReceived",
    (notification) => {
      // 앱이 열려있을 때 알림 수신
      console.log("Push received:", notification);
    },
  );

  PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (notification) => {
      // 사용자가 알림을 탭했을 때
      const data = notification.notification.data;
      if (data?.url) {
        window.location.href = data.url;
      }
    },
  );
}

async function savePushToken(token: string) {
  try {
    await fetch("/api/push-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch (error) {
    console.error("Failed to save push token:", error);
  }
}
