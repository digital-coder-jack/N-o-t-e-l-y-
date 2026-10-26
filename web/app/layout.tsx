import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Notely — Study at warp speed",
  description:
    "A focused study workspace for notes, flashcards, quizzes and planning.",
  applicationName: "Notely",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    type: "website",
    siteName: "Notely",
    title: "Notely — Study at warp speed",
    description: "A focused workspace for notes, recall and study planning.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Notely study workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Notely — Study at warp speed",
    description: "A focused workspace for notes, recall and study planning.",
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // enables safe-area insets on notched phones
  themeColor: "#060c1c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `try { const t = localStorage.getItem("notely-theme"); if (t === "light" || t === "dark") { document.documentElement.dataset.theme = t; document.documentElement.classList.toggle("dark", t === "dark"); const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", t === "dark" ? "#060c1c" : "#f4f7fc"); } } catch (e) {}` }} /></head><body>{children}</body>
    </html>
  );
}
