import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

const font = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Bốc số Photobooth", template: "%s · Bốc số" },
  description: "Lấy số thứ tự và theo dõi lượt chụp trực tiếp trên điện thoại.",
  appleWebApp: { capable: true, title: "Bốc số", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { apple: "/pwa-icon/180" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e11d48",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={font.variable}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
