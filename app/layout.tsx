import type { Metadata, Viewport } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "WOS Hero Optimizer",
  description: "Optimize Whiteout Survival hero EXP, gear, and enhancement spend.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="px-4 py-3 border-b border-slate-800">
          <h1 className="text-lg font-bold">WOS Hero Optimizer</h1>
        </header>
        <main className="flex-1 px-4 py-4 pb-20 max-w-xl mx-auto w-full">{children}</main>
        <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 flex justify-around py-2">
          <Link href="/" className="text-sm text-slate-300 px-3 py-1">
            Home
          </Link>
          <Link href="/optimize" className="text-sm text-slate-300 px-3 py-1">
            Optimize
          </Link>
          <Link href="/bear-trap" className="text-sm text-slate-300 px-3 py-1">
            Bear Trap
          </Link>
          <Link href="/combat" className="text-sm text-slate-300 px-3 py-1">
            Combat
          </Link>
        </nav>
      </body>
    </html>
  );
}
