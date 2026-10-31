import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bốc số Photobooth",
    short_name: "Bốc số",
    description: "Lấy số và theo dõi lượt chụp trực tiếp.",
    start_url: `/${env.defaultShopSlug}`,
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#e11d48",
    lang: "vi",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
