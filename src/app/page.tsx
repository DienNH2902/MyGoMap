import { Header } from "@/components/layout/Header";
import { LandingHero } from "@/components/landing/LandingHero";
import { LocationRequest } from "@/components/common/LocationRequest";
import { LatestUpdatedBadge } from "@/components/landing/LatestUpdateBadge";

export default function HomePage() {
  return (
    <>
      <LocationRequest />
      {/* <Header /> */}
      <LandingHero />
      <LatestUpdatedBadge />
    </>
  );
}
