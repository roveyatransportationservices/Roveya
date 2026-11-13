import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-5 py-32 text-center">
      <p className="kicker">404</p>
      <h1 className="display mt-4 text-5xl">This road does not go anywhere</h1>
      <p className="mt-4 text-cream/60">The page you opened has moved or never existed.</p>
      <Link href="/" className="btn mt-8">
        Back to ROVEYA
      </Link>
    </div>
  );
}
