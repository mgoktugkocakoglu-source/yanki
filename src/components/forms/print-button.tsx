"use client";

import { Printer } from "lucide-react";
import { BUTTON_PRIMARY } from "../ui";

/** Tarayıcının yazdırma penceresini açar; oradan PDF olarak kaydedilebilir. */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={BUTTON_PRIMARY}>
      <Printer className="h-4 w-4" aria-hidden="true" />
      Yazdır / PDF kaydet
    </button>
  );
}
