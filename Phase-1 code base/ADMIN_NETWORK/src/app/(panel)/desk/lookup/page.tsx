import { Suspense } from "react";
import { DeskLookup } from "@/components/desk/Lookup";

export default function DeskLookupPage() {
  return (
    <Suspense>
      <DeskLookup />
    </Suspense>
  );
}
