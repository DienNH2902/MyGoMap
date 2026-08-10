import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { MapExperience } from '@/components/map/MapExperience';

export const metadata: Metadata = {
  title: 'MyGoMap — Lập lộ trình',
};

export default function MapPage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-surface">
      <Header />
      <MapExperience />
    </main>
  );
}
