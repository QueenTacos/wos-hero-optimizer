// Static single-page preview of the app (no Next.js server). Same components
// and optimizer as the real app; Next's file routes become hash tabs.
import "@/app/globals.css";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import HomePage from "@/app/page";
import OptimizePage from "@/app/optimize/page";
import BearTrapPage from "@/app/bear-trap/page";
import CombatPage from "@/app/combat/page";
import SavedResultsPage from "@/app/results/page";

const ROUTES: Record<string, { label: string; el: () => JSX.Element; nav?: boolean }> = {
  home: { label: "Home", el: HomePage, nav: true },
  optimize: { label: "Optimize", el: OptimizePage, nav: true },
  "bear-trap": { label: "Bear Trap", el: BearTrapPage, nav: true },
  combat: { label: "Combat", el: CombatPage, nav: true },
  results: { label: "Saved Results", el: SavedResultsPage },
};
const current = () => {
  const h = location.hash.replace(/^#/, "");
  return h in ROUTES ? h : "optimize";
};

function App() {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const on = () => {
      setRoute(current());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const Page = ROUTES[route].el;
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-4 py-3 border-b border-slate-800 flex items-baseline justify-between gap-2">
        <h1 className="text-lg font-bold">WOS Hero Optimizer</h1>
        <span className="text-[11px] text-slate-500">Preview build</span>
      </header>
      <main className="flex-1 px-4 py-4 pb-24 max-w-xl mx-auto w-full">
        {/* key: remount each tab so it starts fresh, like a page navigation */}
        <Page key={route} />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 flex justify-around pt-2 wos-safe-bottom">
        {Object.entries(ROUTES)
          .filter(([, r]) => r.nav)
          .map(([key, r]) => (
            <a
              key={key}
              href={`#${key}`}
              aria-current={route === key ? "page" : undefined}
              className={`text-sm px-3 py-1 rounded-md ${route === key ? "text-white bg-slate-800" : "text-slate-400"}`}
            >
              {r.label}
            </a>
          ))}
      </nav>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
