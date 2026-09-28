import Link from "next/link";

const items = [
  { href: "/optimize", title: "Optimize Heroes", desc: "Hero EXP, gear, and enhancement planning" },
  { href: "/bear-trap", title: "Bear Trap", desc: "Rally Captain & Rally Joiner recommendations" },
  { href: "/combat", title: "Combat / Counter", desc: "PvP / PvE troop-type counters" },
  { href: "/results", title: "Saved Results", desc: "Review a previous optimization" },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="card block active:scale-[0.99] transition">
          <div className="text-base font-semibold">{item.title}</div>
          <div className="text-sm text-slate-400">{item.desc}</div>
        </Link>
      ))}
    </div>
  );
}
