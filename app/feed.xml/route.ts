import { connection } from "next/server";
import { getStatusPageData } from "@/lib/checkly";
import { siteConfig } from "@/lib/site-config";
import { shouldShowIncidentInHistory } from "@/lib/status-page-rules";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getSeverityLabel(severity: "degraded" | "outage") {
  return severity === "outage" ? "Major outage" : "Degraded Performance";
}

function getSystemStatusLabel(status: string) {
  if (status === "outage") {
    return "Major outage";
  }

  if (status === "degraded") {
    return "Degraded performance";
  }

  if (status === "maintenance") {
    return "Scheduled maintenance";
  }

  return "Operational";
}

function resolveOrigin(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");

  if (host) {
    const protocol = forwardedProto ?? (host.includes("localhost") ? "http" : "https");

    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin.replace("0.0.0.0", "localhost");
}

export async function GET(request: Request) {
  await connection();
  const data = await getStatusPageData();
  const origin = resolveOrigin(request);
  const homeUrl = `${origin}/`;
  const feedUrl = `${origin}/feed.xml`;
  const incidents = data.incidents.filter(shouldShowIncidentInHistory);
  const lastBuildDate = new Date(
    incidents[0]?.startAt ?? data.generatedAt,
  ).toUTCString();

  const items = incidents
    .map((incident) => {
      const title = `${incident.title} - ${getSeverityLabel(incident.severity)}`;
      const description = [
        incident.summary,
        `Service: ${incident.serviceName}.`,
        `Impact window: ${incident.affectedRangeStartLabel} - ${incident.affectedRangeEndLabel} ${siteConfig.monitoring.timeZoneLabel}.`,
      ].join(" ");

      return [
        "<item>",
        `<title>${escapeXml(title)}</title>`,
        `<link>${escapeXml(homeUrl)}</link>`,
        `<guid isPermaLink="false">${escapeXml(incident.id)}</guid>`,
        `<pubDate>${new Date(incident.startAt).toUTCString()}</pubDate>`,
        `<description>${escapeXml(description)}</description>`,
        `<category>${escapeXml(getSeverityLabel(incident.severity))}</category>`,
        "</item>",
      ].join("");
    })
    .join("");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${escapeXml(siteConfig.brand.siteName)}</title>`,
    `<link>${escapeXml(homeUrl)}</link>`,
    `<description>${escapeXml(`Current system status: ${getSystemStatusLabel(data.systemStatus)}.`)}</description>`,
    `<language>${escapeXml(siteConfig.rssLanguage)}</language>`,
    `<lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    `<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    items,
    "</channel>",
    "</rss>",
  ].join("");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": `public, s-maxage=${siteConfig.monitoring.cache.staleSeconds}, stale-while-revalidate=${siteConfig.monitoring.cache.expireSeconds}`,
    },
  });
}
