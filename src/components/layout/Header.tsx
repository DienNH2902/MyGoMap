import Link from 'next/link';

/** Fixed top header shown on every page, carrying the MyGoMap brand mark front and center. */
export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-white/5 bg-ink/90 px-6 backdrop-blur-md">
      <Link href="/" className="group flex items-center gap-2">
        <span className="text-2xl">🧭</span>
        <span className="bg-gradient-to-r from-primary via-accent-gold to-primary bg-[length:200%_auto] bg-clip-text text-xl font-extrabold tracking-tight text-transparent transition-[background-position] duration-700 group-hover:bg-right">
          MyGoMap
        </span>
      </Link>
      <nav className="hidden items-center gap-6 text-sm font-medium text-cream/70 sm:flex">
        <Link href="/map" className="transition hover:text-primary">
          Lập lộ trình
        </Link>
      </nav>
    </header>
  );
}
