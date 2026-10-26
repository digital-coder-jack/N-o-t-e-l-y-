import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Notely — Study at warp speed",
  description:
    "A focused study workspace for notes, flashcards, quizzes and planning.",
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
      <head><script dangerouslySetInnerHTML={{ __html: `try { const t = localStorage.getItem("notely-theme"); if (t === "light" || t === "dark") { document.documentElement.dataset.theme = t; document.documentElement.classList.toggle("dark", t === "dark"); } } catch (e) {}` }} /></head><body>{children}</body>
    </html>
  );
}
