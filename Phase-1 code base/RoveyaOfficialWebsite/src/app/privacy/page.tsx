import type { Metadata } from "next";
import { Prose } from "@/components/Prose";
import { privacySections } from "@/lib/content";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return <Prose kicker="Legal" title="Privacy policy" intro="What ROVEYA collects, why, and the choices you have." sections={privacySections} />;
}
