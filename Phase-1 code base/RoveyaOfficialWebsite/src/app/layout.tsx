import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Outfit } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/Auth";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SITE_URL } from "@/lib/format";

const outfit = Outfit({ subsets: ["latin"], display: "swap", variable: "--font-outfit" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600", "700"], display: "swap", variable: "--font-cormorant" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "ROVEYA · Premium intercity car seats", template: "%s · ROVEYA" },
  description: "Book a single seat in a verified AC car between Hyderabad, Vijayawada, Khammam, Warangal, Tirupati and more. Pick your exact seat, women-only seats, live tracking and SOS on every trip.",
  openGraph: {
    title: "ROVEYA · Premium intercity car seats",
    description: "Reserve your exact seat in a verified AC car. Women-only seats, live tracking and SOS on every trip.",
    url: SITE_URL,
    siteName: "ROVEYA",
    locale: "en_IN",
    type: "website",
    images: [{ url: "/images/hero-car.jpg", width: 1200, height: 675, alt: "ROVEYA car seats" }],
  },
  twitter: { card: "summary_large_image", title: "ROVEYA · Premium intercity car seats", images: ["/images/hero-car.jpg"] },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#12060D" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${cormorant.variable}`}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <Header />
          <main className="min-h-[70vh]">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
