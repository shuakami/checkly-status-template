import { getStatusPageDataSafe } from "@/lib/checkly";
import { siteConfig } from "@/lib/site-config";

export const maxDuration = 30;

export async function GET() {
  const data = await getStatusPageDataSafe();

  return Response.json(data, {
    status: data.loadError ? 503 : 200,
    headers: {
      "Cache-Control": `public, s-maxage=${siteConfig.monitoring.cache.staleSeconds}, stale-while-revalidate=${siteConfig.monitoring.cache.expireSeconds}, stale-if-error=86400`,
    },
  });
}
