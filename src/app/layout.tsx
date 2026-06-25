import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
});

// Mirror getFallbackAppUrl() precedence (src/lib/urls.ts) so OG/icon URLs
// resolve to the same absolute base the rest of the app links with.
const appUrl =
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";

const siteTitle = "Registration System";
const siteDescription = "Conference registration and event management system";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: siteTitle,
  description: siteDescription,
  // favicon.ico / icon.png / apple-icon.png live in src/app and are
  // auto-detected by Next — no manual `icons` entry needed. This replaces
  // the default create-next-app favicon (the "Vercel-looking" mark) with
  // the La Gloire icon. The openGraph/twitter image below is the large card
  // shown when a registration link is pasted into WhatsApp/Slack/etc.
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    siteName: "La Gloire",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "La Gloire",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
