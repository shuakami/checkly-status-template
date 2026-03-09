import { join } from "node:path";
import { connection } from "next/server";
import { getStatusPageDataSafe } from "@/lib/checkly";
import { siteConfig } from "@/lib/site-config";
import { buildStatusIconBuffer } from "@/lib/status-icon";

export async function GET() {
  await connection();
  const data = await getStatusPageDataSafe();
  const iconBuffer = await buildStatusIconBuffer(
    join(process.cwd(), "public", siteConfig.brand.logoFile),
    data.systemStatus,
  );

  return new Response(iconBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": `public, s-maxage=${siteConfig.monitoring.cache.staleSeconds}, stale-while-revalidate=${siteConfig.monitoring.cache.expireSeconds}`,
    },
  });
}
