import type { IncidentSummary, UptimeDay } from "@/lib/status-page-types";
import { siteConfig } from "@/lib/site-config";

export const HISTORY_DEGRADED_THRESHOLD_MS =
  siteConfig.monitoring.degradedHistoryThresholdMinutes * 60 * 1000;
export const HISTORY_OUTAGE_THRESHOLD_MS =
  siteConfig.monitoring.outageHistoryThresholdMinutes * 60 * 1000;

export function getIncidentDurationMs(incident: Pick<IncidentSummary, "startAt" | "endAt">) {
  return Math.max(0, new Date(incident.endAt).getTime() - new Date(incident.startAt).getTime());
}

export function shouldShowIncidentInHistory(incident: IncidentSummary) {
  const durationMs = getIncidentDurationMs(incident);

  if (incident.severity === "outage") {
    return durationMs > HISTORY_OUTAGE_THRESHOLD_MS;
  }

  return durationMs > HISTORY_DEGRADED_THRESHOLD_MS;
}

export function canOpenIncidentFromDay(day: UptimeDay) {
  return day.status !== "operational" && day.status !== "nodata" && Boolean(day.incidentId);
}
