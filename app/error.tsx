"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Status page render error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)]">
      <div className="w-full max-w-[718px] mx-auto px-4 py-8 md:py-12">
        <div className="rounded-lg border-[1.5px] border-[var(--status-maint-icon)] overflow-hidden shadow-[var(--card-shadow)]">
          <div className="px-4 py-3 bg-[var(--status-maint-bg)] text-[var(--text-primary)] font-medium text-sm">
            Status page temporarily unavailable
          </div>
          <div className="px-4 py-4 bg-[var(--bg-card)] flex flex-col gap-4">
            <p className="text-sm text-[var(--text-primary)] leading-relaxed">
              We hit an unexpected problem while rendering this page. Please try again in a moment.
            </p>
            <div>
              <button
                type="button"
                onClick={reset}
                className="px-[12px] py-[6px] text-[13px] font-medium text-[var(--btn-text)] bg-[var(--btn-bg)] border border-[var(--btn-border)] rounded-[6px] hover:bg-[var(--btn-hover)] transition-all duration-200"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
