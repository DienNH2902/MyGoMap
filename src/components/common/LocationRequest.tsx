"use client";

import { useEffect } from "react";

export function LocationRequest() {
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => {},
        (error) => console.warn("Không thể lấy vị trí:", error.message),
      );
    }
  }, []);

  return null;
}
