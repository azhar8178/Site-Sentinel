import { Platform } from "react-native";

export function getBaseUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
  }
  return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
}
