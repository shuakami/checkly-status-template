import { StatusPageClient } from "@/components/status-page-client";
import { getStatusPageDataSafe } from "@/lib/checkly";

export const maxDuration = 30;

export default async function Page() {
  const initialData = await getStatusPageDataSafe();

  return <StatusPageClient initialData={initialData} />;
}
