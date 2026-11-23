import type { Metadata } from "next";
import localFont from "next/font/local";
import { THEME_BOOT } from "@/lib/theme";
import "./globals.css";

const outfit = localFont({
  src: [
    { path: "../fonts/Outfit_400Regular.ttf", weight: "400" },
    { path: "../fonts/Outfit_500Medium.ttf", weight: "500" },
    { path: "../fonts/Outfit_600SemiBold.ttf", weight: "600" },
    { path: "../fonts/Outfit_700Bold.ttf", weight: "700" },
  ],
  display: "swap",
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: { default: "ROVEYA Admin Network", template: "%s · ROVEYA Admin" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outfit.variable} data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
