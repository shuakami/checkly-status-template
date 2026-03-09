import { connection } from "next/server";
import { getStatusPageData } from "@/lib/checkly";
import { siteConfig } from "@/lib/site-config";

export async function GET(request: Request) {
  await connection();
  void request.url;
  const data = await getStatusPageData();

  return Response.json(data, {
    headers: {
      "Cache-Control": `public, s-maxage=${siteConfig.monitoring.cache.staleSeconds}, stale-while-revalidate=${siteConfig.monitoring.cache.expireSeconds}`,
    },
  });
}
