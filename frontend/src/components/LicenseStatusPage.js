import React from "react";
import { LicenseStatus } from "./LicenseStatus";

// Public shareable page (route: /license). DJs open it in any browser.
export default function LicenseStatusPage() {
  const params = new URLSearchParams(window.location.search);
  const defaultKey = params.get("key") || "";
  return (
    <div className="min-h-screen bg-[var(--hl-bg)] text-[var(--hl-text)] grid place-items-center p-4" data-testid="license-status-page">
      <div className="w-full max-w-lg hl-panel rounded-2xl p-6">
        <LicenseStatus defaultKey={defaultKey} embedded />
        <div className="mt-6 pt-4 border-t border-[var(--hl-line)] text-center text-[11px] text-[var(--hl-muted)]">
          © Hot Live 95 Detroit · A.I. Radio
        </div>
      </div>
    </div>
  );
}
