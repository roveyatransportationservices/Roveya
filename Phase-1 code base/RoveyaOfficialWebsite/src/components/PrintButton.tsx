"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      <Printer size={16} /> Print sticker
    </button>
  );
}
