import { cacheLife, cacheTag } from "next/cache";
import { siteConfig } from "@/lib/site-config";
import type {
  IncidentSegment,
  IncidentSummary,
  IncidentTimelineItem,
  ServiceStatusCard,
  StatusPageData,
  StatusPageLoadError,
  SystemStatus,
  UptimeDay,
} from "@/lib/status-page-types";

const CHECKLY_API_BASE_URL = "https://api.checklyhq.com";
const CHECKLY_CACHE_TAG = "checkly-status";
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const INCIDENT_GROUP_GAP_MS = 15 * 60 * 1000;
const DAILY_OPERATIONAL_THRESHOLD_MS =
  siteConfig.monitoring.dailyOperationalThresholdMinutes * 60 * 1000;
const OUTAGE_DISPLAY_THRESHOLD_MS =
  siteConfig.monitoring.outageHistoryThresholdMinutes * 60 * 1000;
const HISTORY_LOOKBACK_DAYS = siteConfig.monitoring.historyLookbackDays;
const CHECKS_PAGE_LIMIT = 100;
const MAX_CHECKS_PAGES = 20;
const CHECK_RESULTS_PAGE_LIMIT = 100;
const MAX_OUTAGE_HISTORY_PAGES = 50;
const MAX_RETRY_ATTEMPTS = 4;
const DISPLAY_LOCALE = siteConfig.locale;
const DISPLAY_TIME_ZONE = siteConfig.monitoring.timeZone;
const DISPLAY_TIME_ZONE_LABEL = siteConfig.monitoring.timeZoneLabel;
const DISPLAY_TIME_ZONE_OFFSET_MS = siteConfig.monitoring.timeZoneOffsetMinutes * 60 * 1000;

const RESOLVED_SUMMARY = "All impacted services have now fully recovered.";
const ZONED_DATE_TIME_FORMATTER = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  month: "long",
});
const HISTORY_RANGE_FORMATTER = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "long",
});
const LOCALIZED_DATE_TIME_FORMATTER = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const ZONED_WEEKDAY_FORMATTER = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  weekday: "short",
});

type ServiceBlueprint = {
  id: string;
  name: string;
  fallbackUrl: string;
  displayTitle: string;
  allowExternalLink: boolean;
};

interface ChecklyCheck {
  id: string;
  checkType: string;
  name: string;
  created_at?: string;
  request?: {
    url?: string;
  };
}

interface ChecklyStatus {
  checkId: string;
  hasFailures: boolean;
  hasErrors: boolean;
  isDegraded: boolean;
}

interface ChecklyResult {
  id: string;
  checkId: string;
  hasFailures: boolean;
  hasErrors: boolean;
  isDegraded: boolean;
  overMaxResponseTime: boolean;
  startedAt: string;
  stoppedAt: string;
}

interface ChecklyResultsPage {
  length: number;
  entries: ChecklyResult[];
  nextId?: string;
}

interface AvailabilityAnalyticsPoint {
  date: string;
  availability: number;
}

interface DailyIncidentAggregate {
  totalImpactMs: number;
  totalOutageMs: number;
  totalDegradedMs: number;
  primaryIncidentId?: string;
}

function isMissingEnvironmentVariableError(error: unknown) {
  return error instanceof Error && error.message.startsWith("Missing environment variable:");
}

function buildLoadError(error: unknown): StatusPageLoadError {
  if (isMissingEnvironmentVariableError(error)) {
    return {
      code: "configuration",
      title: "Status data unavailable",
      body: "Live monitoring has not been configured for this deployment yet. Please check back soon.",
    };
  }

  return {
    code: "upstream",
    title: "Status data temporarily unavailable",
    body: "We could not load the latest monitoring data right now. Please try again shortly.",
  };
}

function resolveDisplayTitle(service: ServiceBlueprint) {
  return service.displayTitle;
}

function resolveConfiguredServiceName(name: string) {
  return siteConfig.services.nameOverrides[name] ?? name;
}

function shouldHideExternalUrl(check: ChecklyCheck) {
  const name = check.name?.toLowerCase() ?? "";
  const url = check.request?.url?.toLowerCase() ?? "";

  return (
    siteConfig.monitoring.hiddenExternalLinkKeywords.some((keyword) =>
      name.includes(keyword.toLowerCase()),
    ) ||
    siteConfig.monitoring.hiddenExternalLinkKeywords.some((keyword) =>
      url.includes(keyword.toLowerCase()),
    ) ||
    url.includes("://cdn.")
  );
}

function buildServiceBlueprint(check: ChecklyCheck): ServiceBlueprint {
  const rawTitle =
    check.name?.trim() ||
    check.request?.url?.trim() ||
    siteConfig.services.fallbackName;
  const title = resolveConfiguredServiceName(rawTitle);

  return {
    id: check.id,
    name: title,
    fallbackUrl: check.request?.url ?? "",
    displayTitle: title,
    allowExternalLink: !shouldHideExternalUrl(check),
  };
}

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildHeaders() {
  return {
    Authorization: `Bearer ${requireEnv("CHECKLY_API_KEY")}`,
    "X-Checkly-Account": requireEnv("CHECKLY_ACCOUNT_ID"),
    Accept: "application/json",
  };
}

async function fetchChecklyJson<T>(
  path: string,
  searchParams?: Record<string, string | number | undefined>,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt += 1) {
    const url = new URL(path, CHECKLY_API_BASE_URL);

    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url, {
      headers: buildHeaders(),
      next: {
        revalidate: siteConfig.monitoring.cache.revalidateSeconds,
        tags: [CHECKLY_CACHE_TAG],
      },
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    const errorBody = await response.text();
    const retryAfterSeconds = Number(response.headers.get("retry-after") ?? "");
    const canRetry =
      response.status === 429 || response.status === 502 || response.status === 503;

    if (canRetry && attempt < MAX_RETRY_ATTEMPTS - 1) {
      const retryDelayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : (attempt + 1) * 1500;

      await delay(retryDelayMs);
      continue;
    }

    throw new Error(`Checkly request failed (${response.status}): ${errorBody}`);
  }

  throw new Error("Checkly request failed after retrying.");
}

async function fetchChecks() {
  const checks: ChecklyCheck[] = [];

  for (let page = 1; page <= MAX_CHECKS_PAGES; page += 1) {
    const currentChecks = await fetchChecklyJson<ChecklyCheck[]>("/v1/checks", {
      limit: CHECKS_PAGE_LIMIT,
      page,
    });

    if (currentChecks.length === 0) {
      break;
    }

    checks.push(...currentChecks);

    if (currentChecks.length < CHECKS_PAGE_LIMIT) {
      break;
    }
  }

  return checks;
}

async function fetchCheckStatuses() {
  try {
    return await fetchChecklyJson<ChecklyStatus[]>("/v1/check-statuses");
  } catch (error) {
    if (error instanceof Error && error.message.includes("Checkly request failed (404)")) {
      return [];
    }

    throw error;
  }
}

async function fetchRecentCheckResults(checkId: string) {
  const page = await fetchChecklyJson<ChecklyResultsPage>(`/v2/check-results/${checkId}`, {
    limit: CHECK_RESULTS_PAGE_LIMIT,
    resultType: "FINAL",
  });

  return page.entries ?? [];
}

function toUnixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

async function fetchOutageHistoryResults(checkId: string, from: Date, to: Date) {
  const collectedResults: ChecklyResult[] = [];
  let nextId: string | undefined;

  for (let pageIndex = 0; pageIndex < MAX_OUTAGE_HISTORY_PAGES; pageIndex += 1) {
    const page = await fetchChecklyJson<ChecklyResultsPage>(`/v2/check-results/${checkId}`, {
      limit: CHECK_RESULTS_PAGE_LIMIT,
      resultType: "FINAL",
      from: toUnixSeconds(from),
      to: toUnixSeconds(to),
      hasFailures: "true",
      nextId,
    });

    if (!page.entries?.length) {
      break;
    }

    collectedResults.push(...page.entries);

    if (!page.nextId) {
      break;
    }

    nextId = page.nextId;
  }

  return collectedResults;
}

function mergeCheckResults(...resultGroups: ChecklyResult[][]) {
  const merged = new Map<string, ChecklyResult>();

  for (const results of resultGroups) {
    for (const result of results) {
      merged.set(result.id, result);
    }
  }

  return [...merged.values()].sort(
    (left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
  );
}

async function fetchAvailabilityAnalytics(check: ChecklyCheck) {
  if (check.checkType !== "API") {
    return null;
  }

  try {
    const raw = await fetchChecklyJson<Record<string, unknown>>(
      `/v1/analytics/api-checks/${check.id}`,
      {
        metrics: "availability",
        quickRange: "last30Days",
        aggregationInterval: 1440,
      },
    );

    return parseAvailabilityAnalytics(raw);
  } catch {
    return null;
  }
}

function parseAvailabilityAnalytics(raw: Record<string, unknown>) {
  const series = Array.isArray(raw.series) ? raw.series : [];
  const points: AvailabilityAnalyticsPoint[] = [];

  for (const item of series) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const entry = item as Record<string, unknown>;
    const metricName = String(entry.metric ?? entry.name ?? "");
    if (metricName && metricName !== "availability") {
      continue;
    }

    const data = Array.isArray(entry.data) ? entry.data : [];
    for (const point of data) {
      if (!point || typeof point !== "object") {
        continue;
      }

      const dataPoint = point as Record<string, unknown>;
      const rawDate = String(
        dataPoint.date ?? dataPoint.timestamp ?? dataPoint.bucket ?? dataPoint.x ?? "",
      );
      const rawAvailability = dataPoint.availability ?? dataPoint.value ?? dataPoint.y;
      const availability = Number(rawAvailability);
      const timestamp = Number(rawDate);
      const date = Number.isFinite(timestamp) ? new Date(timestamp) : new Date(rawDate);

      if (!Number.isFinite(availability) || Number.isNaN(date.getTime())) {
        continue;
      }

      points.push({
        date: toDateKey(date),
        availability,
      });
    }
  }

  return points;
}

function toDateKey(date: Date) {
  const parts = getZonedDateParts(date);

  return [parts.year, parts.month, parts.day].join("-");
}

function toMonthKey(date: Date) {
  const parts = getZonedDateParts(date);

  return `${parts.year}-${parts.month}`;
}

function getZonedDateParts(date: Date) {
  const parts = ZONED_DATE_TIME_FORMATTER.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: lookup.year,
    month: lookup.month,
    day: lookup.day,
    hour: lookup.hour,
    minute: lookup.minute,
  };
}

function formatMonthLabel(date: Date) {
  return MONTH_LABEL_FORMATTER.format(date);
}

function formatWeekdayLabel(date: Date) {
  return ZONED_WEEKDAY_FORMATTER.format(date);
}

function formatHistoryRange(start: Date, end: Date) {
  return `${HISTORY_RANGE_FORMATTER.format(start)} - ${HISTORY_RANGE_FORMATTER.format(end)}`;
}

function formatIncidentDate(date: Date) {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(date);
}

function formatTimelineDate(date: Date) {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: DISPLAY_TIME_ZONE,
  })
    .format(date)
    .replace(",", "");
}

function formatLocalizedDateTime(date: Date) {
  return LOCALIZED_DATE_TIME_FORMATTER.format(date).replace(",", "");
}

function formatClock(date: Date) {
  const parts = getZonedDateParts(date);

  return `${parts.hour}:${parts.minute}`;
}

function formatDurationMs(durationMs: number) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) {
    return `${remainder}m`;
  }

  if (remainder === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder}m`;
}

function formatDuration(start: Date, end: Date) {
  return formatDurationMs(end.getTime() - start.getTime());
}

function isOutageResult(result: ChecklyResult) {
  return result.hasFailures || result.hasErrors;
}

function isDegradedResult(result: ChecklyResult) {
  return !isOutageResult(result) && (result.isDegraded || result.overMaxResponseTime);
}

function getDisplayDayRange(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = Date.UTC(year, month - 1, day) - DISPLAY_TIME_ZONE_OFFSET_MS;

  return {
    start,
    end: start + DAY_IN_MS,
  };
}

function buildDailyIncidentAggregates(incidents: IncidentSummary[]) {
  const aggregates = new Map<string, DailyIncidentAggregate>();

  for (const incident of incidents) {
    const startMs = new Date(incident.startAt).getTime();
    const rawEndMs = new Date(incident.endAt).getTime();
    const endMs = Math.max(rawEndMs, startMs + 60_000);
    let cursorMs = startMs;

    while (cursorMs < endMs) {
      const dateKey = toDateKey(new Date(cursorMs));
      const dayRange = getDisplayDayRange(dateKey);
      const segmentEndMs = Math.min(endMs, dayRange.end);
      const existing = aggregates.get(dateKey) ?? {
        totalImpactMs: 0,
        totalOutageMs: 0,
        totalDegradedMs: 0,
        primaryIncidentId: undefined,
      };
      const segmentDurationMs = Math.max(0, segmentEndMs - cursorMs);

      existing.totalImpactMs += segmentDurationMs;
      if (incident.severity === "outage") {
        existing.totalOutageMs += segmentDurationMs;
      } else {
        existing.totalDegradedMs += segmentDurationMs;
      }
      existing.primaryIncidentId ??= incident.id;
      aggregates.set(dateKey, existing);

      cursorMs = Math.max(segmentEndMs, dayRange.end);
    }
  }

  return aggregates;
}

function groupResultsByGap(results: ChecklyResult[]) {
  const sortedResults = [...results].sort(
    (left, right) =>
      new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime(),
  );

  if (sortedResults.length === 0) {
    return [];
  }

  const groups: ChecklyResult[][] = [];
  for (const result of sortedResults) {
    const currentGroup = groups.at(-1);

    if (!currentGroup) {
      groups.push([result]);
      continue;
    }

    const previous = currentGroup.at(-1);
    const previousTime = previous ? new Date(previous.stoppedAt).getTime() : 0;
    const currentTime = new Date(result.startedAt).getTime();

    if (currentTime - previousTime <= INCIDENT_GROUP_GAP_MS) {
      currentGroup.push(result);
    } else {
      groups.push([result]);
    }
  }

  return groups;
}

function groupIssueResults(results: ChecklyResult[]) {
  return groupResultsByGap(results.filter(isIssueResult));
}

function resolveIncidentSeverity(group: ChecklyResult[]): IncidentSummary["severity"] | null {
  const hasCountedOutage = groupResultsByGap(group.filter(isOutageResult)).some((outageGroup) => {
    const firstOutage = outageGroup[0];
    const lastOutage = outageGroup[outageGroup.length - 1];

    return (
      new Date(lastOutage.stoppedAt).getTime() - new Date(firstOutage.startedAt).getTime() >
      OUTAGE_DISPLAY_THRESHOLD_MS
    );
  });

  if (hasCountedOutage) {
    return "outage";
  }

  if (group.some(isDegradedResult)) {
    return "degraded";
  }

  return null;
}

function isIssueResult(result: ChecklyResult) {
  return (
    result.hasFailures ||
    result.hasErrors ||
    result.isDegraded ||
    result.overMaxResponseTime
  );
}

function getIgnoredIssueResultIds(results: ChecklyResult[]) {
  const ignoredResultIds = new Set<string>();

  for (const group of groupIssueResults(results)) {
    if (resolveIncidentSeverity(group) === null) {
      for (const result of group) {
        ignoredResultIds.add(result.id);
      }
    }
  }

  return ignoredResultIds;
}

function calculateUptimeLabel(results: ChecklyResult[], ignoredResultIds: Set<string>) {
  if (results.length === 0) {
    return "No data";
  }

  const countedResults = results.filter((result) => !ignoredResultIds.has(result.id));

  if (countedResults.length === 0) {
    return "100.0% uptime";
  }

  const passingRuns = countedResults.filter((result) => !isIssueResult(result)).length;
  const uptime = (passingRuns / countedResults.length) * 100;
  return `${uptime.toFixed(1)}% uptime`;
}

function resolveServiceStatus(
  status: ChecklyStatus | undefined,
  results: ChecklyResult[],
): SystemStatus {
  const latestIssueGroup = groupIssueResults(results).at(-1);
  const latestIssueSeverity = latestIssueGroup
    ? resolveIncidentSeverity(latestIssueGroup)
    : null;

  if (status) {
    if (status.hasFailures || status.hasErrors) {
      return latestIssueSeverity ?? "operational";
    }

    if (status.isDegraded) {
      return "degraded";
    }

    return "operational";
  }

  const latestResult = [...results].sort(
    (left, right) =>
      new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
  )[0];

  if (!latestResult) {
    return "operational";
  }

  if (latestResult.hasFailures || latestResult.hasErrors) {
    return latestIssueSeverity ?? "operational";
  }

  if (latestResult.isDegraded || latestResult.overMaxResponseTime) {
    return "degraded";
  }

  return "operational";
}

function buildIncidentSegments(
  startAt: Date,
  endAt: Date,
  severity: "degraded" | "outage",
): IncidentSegment[] {
  const paddingMs = 30 * 60 * 1000;
  const timelineStart = new Date(startAt.getTime() - paddingMs);
  const timelineEnd = new Date(endAt.getTime() + paddingMs);
  const total = Math.max(1, timelineEnd.getTime() - timelineStart.getTime());
  const segments = [
    {
      from: timelineStart,
      to: startAt,
      tone: "operational" as const,
      statusLabel: "Operational",
    },
    {
      from: startAt,
      to: endAt,
      tone: severity,
      statusLabel: severity === "outage" ? "Major outage" : "Degraded Performance",
    },
    {
      from: endAt,
      to: timelineEnd,
      tone: "operational" as const,
      statusLabel: "Operational",
    },
  ];

  let accumulated = 0;

  return segments
    .filter((segment) => segment.to.getTime() > segment.from.getTime())
    .map((segment) => {
      const width = ((segment.to.getTime() - segment.from.getTime()) / total) * 100;
      const center = accumulated + width / 2;
      accumulated += width;

      return {
        width: `${width}%`,
        center: `${center}%`,
        tone: segment.tone,
        statusLabel: segment.statusLabel,
        timeLabel: `${formatClock(segment.from)} - ${formatClock(segment.to)} ${DISPLAY_TIME_ZONE_LABEL}`,
      };
    });
}

function buildIncidentTimeline(
  startAt: Date,
  endAt: Date,
  severity: "degraded" | "outage",
): IncidentTimelineItem[] {
  return [
    {
      label: "Resolved",
      timeLabel: `${formatTimelineDate(endAt)} ${DISPLAY_TIME_ZONE_LABEL}`,
      tone: "operational",
    },
    {
      label: "Investigating",
      timeLabel: `${formatTimelineDate(startAt)} ${DISPLAY_TIME_ZONE_LABEL}`,
      tone: severity,
    },
  ];
}

function buildIncidents(
  service: ServiceBlueprint,
  check: ChecklyCheck | undefined,
  results: ChecklyResult[],
): IncidentSummary[] {
  if (!check || results.length === 0) {
    return [];
  }

  const groups = groupIssueResults(results);

  if (groups.length === 0) {
    return [];
  }

  return groups
    .flatMap((group, index): IncidentSummary[] => {
      const first = group[0];
      const last = group[group.length - 1];
      const startAt = new Date(first.startedAt);
      const endAt = new Date(last.stoppedAt);
      const severity = resolveIncidentSeverity(group);

      if (!severity) {
        return [];
      }

      return [
        {
          id: `${service.id}-${toDateKey(startAt)}-${index}`,
          serviceId: service.id,
          serviceName: service.name,
          monthKey: toMonthKey(startAt),
          dateKey: toDateKey(startAt),
          title: resolveDisplayTitle(service),
          summary: RESOLVED_SUMMARY,
          status: "resolved" as const,
          severity,
          statusLabel: "Resolved",
          dateLabel: formatIncidentDate(startAt),
          monthLabel: formatMonthLabel(startAt),
          dayNumber: getZonedDateParts(startAt).day,
          weekdayLabel: formatWeekdayLabel(startAt),
          historyTimeLabel: formatClock(endAt),
          affectedRangeStartLabel: formatLocalizedDateTime(startAt),
          affectedRangeEndLabel: formatClock(endAt),
          componentLabel: service.name,
          componentCountLabel: "1 affected component",
          segments: buildIncidentSegments(startAt, endAt, severity),
          timeline: buildIncidentTimeline(startAt, endAt, severity),
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        },
      ];
    })
    .sort(
      (left, right) =>
        new Date(right.startAt).getTime() - new Date(left.startAt).getTime(),
    );
}

function buildUptimeDays(
  dayCount: number,
  incidents: IncidentSummary[],
  results: ChecklyResult[],
  analyticsPoints: AvailabilityAnalyticsPoint[] | null,
  status: SystemStatus,
  today: Date,
): UptimeDay[] {
  const incidentByDate = buildDailyIncidentAggregates(incidents);
  const resultDates = new Set(results.map((result) => toDateKey(new Date(result.startedAt))));
  const analyticsByDate = new Map(
    (analyticsPoints ?? []).map((point) => [point.date, point.availability]),
  );

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(today.getTime() - (dayCount - 1 - index) * DAY_IN_MS);
    const key = toDateKey(date);
    const incident = incidentByDate.get(key);
    const availability = analyticsByDate.get(key);

    if (incident) {
      const hasCountedOutage = incident.totalOutageMs > OUTAGE_DISPLAY_THRESHOLD_MS;
      const hasCountedDegraded = incident.totalDegradedMs > DAILY_OPERATIONAL_THRESHOLD_MS;
      const status = hasCountedOutage
        ? "down"
        : hasCountedDegraded
          ? "degraded"
          : "operational";
      const durationMs = hasCountedOutage
        ? incident.totalOutageMs
        : hasCountedDegraded
          ? incident.totalDegradedMs
          : incident.totalImpactMs;

      return {
        date: key,
        status,
        duration: formatDurationMs(durationMs),
        label:
          status === "down"
            ? "Major outage"
            : status === "degraded"
              ? "Degraded Performance"
              : "Operational",
        incidentId: status === "operational" ? undefined : incident.primaryIncidentId,
      };
    }

    if (availability !== undefined) {
      const impactedMs = ((100 - availability) / 100) * DAY_IN_MS;
      const withinThreshold = impactedMs <= DAILY_OPERATIONAL_THRESHOLD_MS;

      return {
        date: key,
        status: withinThreshold ? "operational" : availability < 100 ? "down" : "operational",
        duration: availability < 100 ? formatDurationMs(impactedMs) : undefined,
        label:
          availability < 100
            ? withinThreshold
              ? "Operational"
              : "Major outage"
            : undefined,
      };
    }

    if (resultDates.has(key)) {
      return {
        date: key,
        status: "operational",
      };
    }

    if (key === toDateKey(today) && status === "operational") {
      return {
        date: key,
        status: "operational",
      };
    }

    return {
      date: key,
      status: "nodata",
    };
  });
}

function buildServiceCard(
  service: ServiceBlueprint,
  check: ChecklyCheck | undefined,
  status: ChecklyStatus | undefined,
  currentResults: ChecklyResult[],
  historyResults: ChecklyResult[],
  incidents: IncidentSummary[],
  analyticsPoints: AvailabilityAnalyticsPoint[] | null,
  today: Date,
): ServiceStatusCard {
  const serviceStatus = resolveServiceStatus(
    status,
    currentResults.length > 0 ? currentResults : historyResults,
  );
  const ignoredResultIds = getIgnoredIssueResultIds(currentResults);
  const desktopDays = buildUptimeDays(
    HISTORY_LOOKBACK_DAYS,
    incidents,
    historyResults,
    analyticsPoints,
    serviceStatus,
    today,
  );

  return {
    id: service.id,
    name: service.name,
    externalUrl: check?.request?.url ?? service.fallbackUrl,
    allowExternalLink: service.allowExternalLink,
    status: serviceStatus,
    uptimeLabel: calculateUptimeLabel(currentResults, ignoredResultIds),
    desktopDays,
    mobileDays: desktopDays.slice(-30),
  };
}

function resolveOverallStatus(services: ServiceStatusCard[]): SystemStatus {
  if (services.some((service) => service.status === "outage")) {
    return "outage";
  }

  if (services.some((service) => service.status === "degraded")) {
    return "degraded";
  }

  if (services.some((service) => service.status === "maintenance")) {
    return "maintenance";
  }

  return "operational";
}

function resolveRangeLabel(
  _checks: ChecklyCheck[],
  _incidents: IncidentSummary[],
  today: Date,
) {
  const windowStart = new Date(today);

  windowStart.setMonth(windowStart.getMonth() - 2);

  return formatHistoryRange(windowStart, today);
}

function buildFallbackStatusPageData(error: unknown, today = new Date()): StatusPageData {
  const loadError = buildLoadError(error);

  return {
    generatedAt: today.toISOString(),
    systemStatus: "maintenance",
    rangeLabel: resolveRangeLabel([], [], today),
    services: [],
    incidents: [],
    loadError,
  };
}

export async function getStatusPageData(): Promise<StatusPageData> {
  "use cache";

  cacheLife({
    stale: siteConfig.monitoring.cache.staleSeconds,
    revalidate: siteConfig.monitoring.cache.revalidateSeconds,
    expire: siteConfig.monitoring.cache.expireSeconds,
  });
  cacheTag(CHECKLY_CACHE_TAG, "checkly-incidents");

  const today = new Date();
  const historyWindowStart = new Date(today.getTime() - HISTORY_LOOKBACK_DAYS * DAY_IN_MS);
  const [checks, statuses] = await Promise.all([fetchChecks(), fetchCheckStatuses()]);
  const servicesToRender = checks.map(buildServiceBlueprint);
  const servicePayload: Array<{
    card: ServiceStatusCard;
    incidents: IncidentSummary[];
  }> = [];

  for (const service of servicesToRender) {
    const check = checks.find((item) => item.id === service.id);
    const serviceStatus = statuses.find((item) => item.checkId === service.id);
    const [recentResults, analytics, outageHistoryResults] = await Promise.all([
      check ? fetchRecentCheckResults(check.id) : Promise.resolve([]),
      check ? fetchAvailabilityAnalytics(check) : Promise.resolve(null),
      check ? fetchOutageHistoryResults(check.id, historyWindowStart, today) : Promise.resolve([]),
    ]);
    const historyResults = mergeCheckResults(recentResults, outageHistoryResults);
    const incidents = buildIncidents(service, check, historyResults);

    servicePayload.push({
      card: buildServiceCard(
        service,
        check,
        serviceStatus,
        recentResults,
        historyResults,
        incidents,
        analytics,
        today,
      ),
      incidents,
    });
  }

  const services = servicePayload.map((item) => item.card);
  const incidents = servicePayload
    .flatMap((item) => item.incidents)
    .sort(
      (left, right) =>
        new Date(right.startAt).getTime() - new Date(left.startAt).getTime(),
    );

  return {
    generatedAt: today.toISOString(),
    systemStatus: resolveOverallStatus(services),
    rangeLabel: resolveRangeLabel(checks, incidents, today),
    services,
    incidents,
  };
}

export async function getStatusPageDataSafe(): Promise<StatusPageData> {
  try {
    return await getStatusPageData();
  } catch (error) {
    console.error("Failed to load status page data:", error);

    return buildFallbackStatusPageData(error);
  }
}
