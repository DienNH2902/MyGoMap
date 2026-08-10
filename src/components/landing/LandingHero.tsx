import Link from 'next/link';
import { HeroRouteLine } from './HeroRouteLine';
import { Button } from '../ui/Button';

/** Landing page hero: welcome message, short description, and the entry point into /map. */
export function LandingHero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-6">
      {/* Ambient glow behind the copy, reinforcing the orange brand color. */}
      <div className="absolute left-1/2 top-1/3 h-[500px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[140px]" />
      <HeroRouteLine />

      <div className="relative z-10 flex max-w-2xl flex-col items-center gap-6 text-center">
        <span className="rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.2em] text-accent-gold">
          Lộ trình thông minh cho mọi chuyến đi
        </span>

        <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-cream sm:text-7xl">
          Chào mừng đến với{' '}
          <span className="bg-gradient-to-r from-primary via-accent-gold to-primary bg-clip-text text-transparent">
            MyGoMap
          </span>
        </h1>

        <p className="max-w-xl text-balance text-base leading-relaxed text-cream/70 sm:text-lg">
          MyGoMap giúp bạn lên kế hoạch cho mọi hành trình trên khắp Việt Nam: tìm đường đi
          nhanh nhất, tự động gợi ý trạm xăng, trạm dừng chân, quán ăn hay quán cà phê ngay
          trên tuyến đường của bạn — hoàn toàn miễn phí.
        </p>

        <Link href="/map">
          <Button variant="primary" className="mt-2 px-8 py-4 text-base">
            Bắt đầu hành trình
            <span aria-hidden="true">→</span>
          </Button>
        </Link>
      </div>
    </section>
  );
}
