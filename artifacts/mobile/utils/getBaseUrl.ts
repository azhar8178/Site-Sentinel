import { Platform } from "react-native";

const PRODUCTION_API_URL = "https://monit.lovefurniture.ie";

export function getBaseUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
  }
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  }
  return PRODUCTION_API_URL;
}
