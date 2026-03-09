import { Suspense } from "react";
import { connection } from "next/server";
import { StatusPageClient } from "@/components/status-page-client";
import { getStatusPageDataSafe } from "@/lib/checkly";

async function StatusPageContent() {
  await connection();
  const initialData = await getStatusPageDataSafe();

  return <StatusPageClient initialData={initialData} />;
}

function StatusPageFallback() {
  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)]">
      <div className="w-full max-w-[718px] mx-auto px-4 py-8 md:py-12">
        <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] shadow-[var(--card-shadow)] px-4 py-6 text-sm text-[var(--text-secondary)]">
          Loading status...
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<StatusPageFallback />}>
      <StatusPageContent />
    </Suspense>
  );
}
