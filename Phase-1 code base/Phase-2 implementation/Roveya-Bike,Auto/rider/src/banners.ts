import type { Banner } from "./components/BannerCarousel";

const wide = 1000 / 563;

export const art = {
  hero: { image: require("../assets/cap-hero.jpg"), ratio: 864 / 1152, focus: 0.3 },
  ride: { image: require("../assets/cap-banner-ride.jpg"), ratio: wide, focus: 0.32 },
  auto: { image: require("../assets/cap-banner-auto.jpg"), ratio: wide, focus: 0.4 },
  cab: { image: require("../assets/cap-banner-cab.jpg"), ratio: wide, focus: 0.36 },
  earn: { image: require("../assets/cap-banner-earn.jpg"), ratio: wide, focus: 0.26 },
};

export function slide(photo: (typeof art)[keyof typeof art], kicker: string, title: string, cta?: string, onPress?: () => void): Banner {
  return { ...photo, kicker, title, cta, onPress };
}
