import { connection } from "next/server";
import { getStatusPageDataSafe } from "@/lib/checkly";
import { siteConfig } from "@/lib/site-config";

export const maxDuration = 30;

export async function GET(request: Request) {
  await connection();
  void request.url;
  const data = await getStatusPageDataSafe();

  return Response.json(data, {
    status: data.loadError ? 503 : 200,
    headers: {
      "Cache-Control": `public, s-maxage=${siteConfig.monitoring.cache.staleSeconds}, stale-while-revalidate=${siteConfig.monitoring.cache.expireSeconds}`,
    },
  });
}
