import { Suspense } from "react";
import { connection } from "next/server";
import { StatusPageClient } from "@/components/status-page-client";
import { getStatusPageDataSafe } from "@/lib/checkly";

export const maxDuration = 30;

async function StatusPageContent() {
  await connection();
  const initialData = await getStatusPageDataSafe();

  return <StatusPageClient initialData={initialData} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <StatusPageContent />
    </Suspense>
  );
}
