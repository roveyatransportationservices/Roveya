import { testimonials as SAMPLE, type Testimonial } from "./content";

type ServerReview = { id: string; name: string; role: string; route: string; seat: string; rating: number; quote: string; image: string };

// Reviews without a photo borrow one of the launch photos, in turn.
const PHOTOS = SAMPLE.map((item) => item.image);

const FULL_ROW = 6;

// Server-side: published reviews from the platform come first. Until there are six,
// the launch stories fill the rest so the carousel never looks empty.
export async function loadReviews(): Promise<Testimonial[]> {
  let live: Testimonial[] = [];
  try {
    const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
    if (!base) throw new Error();
    const response = await fetch(`${base}/api/v1/reviews`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error();
    const data = (await response.json()) as { reviews: ServerReview[] };
    live = data.reviews.map((review, at) => ({
      name: review.name,
      role: review.role || "ROVEYA traveller",
      route: review.route || "ROVEYA trip",
      seat: review.seat || "Verified trip",
      rating: review.rating,
      quote: review.quote,
      image: review.image || PHOTOS[at % PHOTOS.length],
      alt: `${review.name}, a ROVEYA traveller`,
    }));
  } catch {
    // The launch stories cover the section.
  }
  if (live.length >= FULL_ROW) return live;
  const names = new Set(live.map((item) => item.name.toLowerCase()));
  return [...live, ...SAMPLE.filter((item) => !names.has(item.name.toLowerCase()))];
}
