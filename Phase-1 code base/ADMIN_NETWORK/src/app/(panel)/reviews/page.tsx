import { redirect } from "next/navigation";

// Reviews moved to the Support Desk: Reviews and Ratings.
export default function ReviewsPage() {
  redirect("/desk/ratings/website");
}
