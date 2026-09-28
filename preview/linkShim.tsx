// next/link replacement for the static preview: routes are hash tabs (#optimize, #bear-trap …).
import type { ReactNode } from "react";
export default function Link({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const route = href.replace(/^\//, "") || "home";
  return (
    <a href={`#${route}`} className={className}>
      {children}
    </a>
  );
}
