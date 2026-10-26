"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <div className="not-found-mark"><BookOpen size={24} aria-hidden="true" /></div>
      <span className="eyebrow">404 · PAGE NOT FOUND</span>
      <h1>This page took a wrong turn.</h1>
      <p>The page may have moved, or the address may be incorrect. Your workspace is still here.</p>
      <Link href="/" className="action-button"><ArrowLeft size={16} /> Back to workspace</Link>
    </main>
  );
}
