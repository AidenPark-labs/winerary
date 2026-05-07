"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import Toast from "./Toast";

export default function NativeShell() {
  const [exitHint, setExitHint] = useState(false);
  const lastBackPress = useRef(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let remove: (() => void) | undefined;

    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
        return;
      }
      const now = Date.now();
      if (now - lastBackPress.current < 2000) {
        App.exitApp();
      } else {
        lastBackPress.current = now;
        setExitHint(true);
      }
    }).then((handle) => {
      remove = () => handle.remove();
    });

    return () => remove?.();
  }, []);

  return (
    <Toast
      message="한 번 더 누르면 종료됩니다"
      visible={exitHint}
      onHide={() => setExitHint(false)}
    />
  );
}
