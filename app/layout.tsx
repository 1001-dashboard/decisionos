import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://danilorusciano.it"),
  title: "Decision OS · Il tuo spazio decisionale personale",
  description: "Analisi decisionale spiegabile: alternative, rischi, fatti e ipotesi, effetti tra le scelte, scenari e registro nel tempo.",
  openGraph: { images: ["/decisionos/brand/og.png"] },
  manifest: "/decisionos/manifest.webmanifest",
};
export const viewport: Viewport = { themeColor: "#0d2c4a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
