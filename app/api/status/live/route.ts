import { connection } from "next/server";
import { getLiveStatusPageDataSafe } from "@/lib/checkly";

export const maxDuration = 30;

export async function GET(request: Request) {
  await connection();
  void request.url;
  const data = await getLiveStatusPageDataSafe();

  return Response.json(data, {
    status: data.loadError ? 503 : 200,
    headers: {
      "Cache-Control": "public, s-maxage=15, stale-while-revalidate=15, stale-if-error=60",
    },
  });
}
