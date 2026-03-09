"use client";

import Image from "next/image";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  Info,
  Rss,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { siteConfig } from "@/lib/site-config";
import type {
  IncidentSegment,
  IncidentSummary,
  IncidentTimelineItem,
  LiveStatusPageData,
  StatusPageLoadError,
  ServiceStatusCard,
  StatusPageData,
  SystemStatus,
  UptimeDay,
} from "@/lib/status-page-types";
import {
  canOpenIncidentFromDay,
  shouldShowIncidentInHistory,
} from "@/lib/status-page-rules";

const MONTH_RANGE_FORMATTER = new Intl.DateTimeFormat(siteConfig.locale, {
  year: "numeric",
  month: "long",
  timeZone: "UTC",
});
const RANGE_EDGE_FORMATTER = new Intl.DateTimeFormat(siteConfig.locale, {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

type RangeOption = {
  key: string;
  label: string;
  startLabel: string;
  endLabel: string;
  startMonthKey: string;
  endMonthKey: string;
};

const AUTO_REFRESH_INTERVAL_MS = siteConfig.monitoring.clientRefreshSeconds * 1000;

const StatusIcon = ({
  className = "w-[18px] h-[18px] text-[var(--status-op-icon)] fill-current",
}: {
  className?: string;
}) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1.177 14.14L7 12.316l1.414-1.414 2.409 2.408 6.177-6.177 1.414 1.414-7.591 7.593z" />
  </svg>
);

const ErrorIcon = ({
  className = "w-[16px] h-[16px] text-[var(--status-down-icon)] fill-current",
}: {
  className?: string;
}) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      xmlns="http://www.w3.org/2000/svg"
      d="M15.189 10.557L9.764 1.161C9.344 0.434 8.592 0 7.752 0C6.912 0 6.16 0.434 5.74 1.161L0.315 10.557C-0.105 11.284 -0.105 12.152 0.315 12.879C0.735 13.607 1.487 14.041 2.327 14.041H13.177C14.017 14.041 14.769 13.607 15.189 12.879C15.609 12.152 15.609 11.284 15.189 10.557ZM7.002 4.541C7.002 4.127 7.338 3.791 7.752 3.791C8.166 3.791 8.502 4.127 8.502 4.541V8.041C8.502 8.455 8.166 8.791 7.752 8.791C7.338 8.791 7.002 8.455 7.002 8.041V4.541ZM7.752 11.61C7.2 11.61 6.752 11.161 6.752 10.61C6.752 10.059 7.2 9.61 7.752 9.61C8.304 9.61 8.752 10.059 8.752 10.61C8.752 11.161 8.304 11.61 7.752 11.61Z"
      fill="currentColor"
    />
  </svg>
);

function getToneClass(tone: IncidentSegment["tone"] | IncidentTimelineItem["tone"]) {
  if (tone === "outage") {
    return "bg-[var(--status-down-icon)]";
  }

  if (tone === "degraded") {
    return "bg-[var(--status-deg-icon)]";
  }

  return "bg-[var(--status-op-icon)]";
}

function getStatusToneClass(status: SystemStatus) {
  if (status === "outage") {
    return "bg-[var(--status-down-bg)]";
  }

  if (status === "degraded") {
    return "bg-[var(--status-deg-bg)]";
  }

  if (status === "maintenance") {
    return "bg-[var(--status-maint-bg)]";
  }

  return "bg-[var(--status-op-bg)]";
}

function getStatusCardClass(status: SystemStatus) {
  if (status === "outage") {
    return "border-[1.5px] border-[var(--status-down-icon)]";
  }

  if (status === "degraded") {
    return "border-[1.5px] border-[var(--status-deg-icon)]";
  }

  if (status === "maintenance") {
    return "border-[1.5px] border-[var(--status-maint-icon)]";
  }

  return "border-[1.5px] border-[var(--status-op-icon)]";
}

function renderStatusIcon(status: SystemStatus) {
  if (status === "outage") {
    return <ErrorIcon className="w-[16px] h-[16px] text-[var(--status-down-icon)]" />;
  }

  if (status === "degraded") {
    return <ErrorIcon className="w-[16px] h-[16px] text-[var(--status-deg-icon)]" />;
  }

  if (status === "maintenance") {
    return <Info className="w-[16px] h-[16px] text-[var(--status-maint-icon)]" />;
  }

  return <StatusIcon />;
}

function getHeadline(data: StatusPageData) {
  if (data.loadError) {
    return {
      title: data.loadError.title,
      body: data.loadError.body,
      toneClass: getStatusToneClass("maintenance"),
      status: "maintenance" as const,
    };
  }

  if (data.systemStatus === "outage") {
    return {
      title: siteConfig.copy.headlines.outage.title,
      body: siteConfig.copy.headlines.outage.body,
      toneClass: getStatusToneClass("outage"),
      status: "outage" as const,
    };
  }

  if (data.systemStatus === "degraded") {
    return {
      title: siteConfig.copy.headlines.degraded.title,
      body: siteConfig.copy.headlines.degraded.body,
      toneClass: getStatusToneClass("degraded"),
      status: "degraded" as const,
    };
  }

  if (data.systemStatus === "maintenance") {
    return {
      title: siteConfig.copy.headlines.maintenance.title,
      body: siteConfig.copy.headlines.maintenance.body,
      toneClass: getStatusToneClass("maintenance"),
      status: "maintenance" as const,
    };
  }

  return {
    title: siteConfig.copy.headlines.operational.title,
    body: siteConfig.copy.headlines.operational.body,
    toneClass: getStatusToneClass("operational"),
    status: "operational" as const,
  };
}

function formatMonthRangeLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);

  return MONTH_RANGE_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatWindowRangeLabel(startMonthKey: string, endMonthKey: string) {
  if (startMonthKey === endMonthKey) {
    return formatMonthRangeLabel(startMonthKey);
  }

  return `${formatMonthRangeLabel(startMonthKey)} - ${formatMonthRangeLabel(endMonthKey)}`;
}

function formatRangeEdgeLabel(date: string) {
  return RANGE_EDGE_FORMATTER.format(new Date(`${date}T00:00:00Z`));
}

function buildRangeOptions(services: ServiceStatusCard[]) {
  const allDates = new Set<string>();
  const monthKeys = new Set<string>();

  for (const service of services) {
    for (const day of service.desktopDays) {
      allDates.add(day.date);
      monthKeys.add(day.date.slice(0, 7));
    }
  }

  const sortedDates = [...allDates].sort((left, right) => left.localeCompare(right));
  const sortedMonthKeys = [...monthKeys].sort((left, right) => left.localeCompare(right));

  if (sortedDates.length === 0 || sortedMonthKeys.length === 0) {
    return [];
  }

  const createRangeOption = (startMonthKey: string, endMonthKey: string): RangeOption => {
    const visibleDates = sortedDates.filter((date) => {
      const monthKey = date.slice(0, 7);

      return monthKey >= startMonthKey && monthKey <= endMonthKey;
    });
    const firstDate = visibleDates[0] ?? sortedDates[0];
    const lastDate = visibleDates[visibleDates.length - 1] ?? sortedDates[sortedDates.length - 1];

    return {
      key: `${startMonthKey}:${endMonthKey}`,
      label: formatWindowRangeLabel(startMonthKey, endMonthKey),
      startLabel: formatRangeEdgeLabel(firstDate),
      endLabel: formatRangeEdgeLabel(lastDate),
      startMonthKey,
      endMonthKey,
    };
  };

  if (sortedMonthKeys.length <= 3) {
    return [
      createRangeOption(sortedMonthKeys[0], sortedMonthKeys[sortedMonthKeys.length - 1]),
    ];
  }

  return sortedMonthKeys.flatMap((endMonthKey, endIndex) => {
    if (endIndex < 2) {
      return [];
    }

    const startMonthKey = sortedMonthKeys[endIndex - 2];

    return [createRangeOption(startMonthKey, endMonthKey)];
  });
}

function hasSameLiveStatus(currentData: StatusPageData, liveData: LiveStatusPageData) {
  if (currentData.systemStatus !== liveData.systemStatus) {
    return false;
  }

  const liveStatusesByServiceId = new Map(
    liveData.services.map((service) => [service.id, service.status]),
  );

  return currentData.services.every(
    (service) =>
      (liveStatusesByServiceId.get(service.id) ?? service.status) === service.status,
  );
}

function mergeLiveStatusIntoSnapshot(
  currentData: StatusPageData,
  liveData: LiveStatusPageData,
): StatusPageData {
  const liveStatusesByServiceId = new Map(
    liveData.services.map((service) => [service.id, service.status]),
  );

  return {
    ...currentData,
    systemStatus: liveData.systemStatus,
    services: currentData.services.map((service) => ({
      ...service,
      status: liveStatusesByServiceId.get(service.id) ?? service.status,
    })),
  };
}

function getTooltipLayoutKey(day: UptimeDay) {
  const hasSecondaryLine =
    (day.status === "down" || day.status === "degraded") && Boolean(day.duration);

  return hasSecondaryLine ? "detail" : "summary";
}

function isDateInRangeOption(date: string, range: RangeOption | null) {
  if (!range) {
    return true;
  }

  const monthKey = date.slice(0, 7);

  return monthKey >= range.startMonthKey && monthKey <= range.endMonthKey;
}

function getVisibleRangeDays(days: UptimeDay[], range: RangeOption | null) {
  if (!range) {
    return days;
  }

  const visibleDays = days.filter((day) => isDateInRangeOption(day.date, range));

  return visibleDays.length > 0 ? visibleDays : days;
}

function shouldShowExternalLink(service: ServiceStatusCard) {
  return (
    service.allowExternalLink &&
    Boolean(service.externalUrl) &&
    !siteConfig.monitoring.hiddenExternalLinkFragments.some((fragment) =>
      service.externalUrl.includes(fragment),
    )
  );
}

function getHistoryAccentClass(severity: IncidentSummary["severity"]) {
  return severity === "outage"
    ? "border-[var(--status-down-icon)]"
    : "border-[var(--status-deg-icon)]";
}

function getHistoryHoverClass(severity: IncidentSummary["severity"]) {
  return severity === "outage"
    ? "group-hover:text-[var(--status-down-icon)]"
    : "group-hover:text-[var(--status-deg-icon)]";
}

function NoticeCard({
  title,
  body,
  status,
}: {
  title: string;
  body: string;
  status: SystemStatus;
}) {
  return (
    <div
      className={`rounded-lg ${getStatusCardClass(status)} overflow-hidden shadow-[var(--card-shadow)]`}
    >
      <div
        className={`px-4 py-3 flex items-center gap-2 text-[var(--text-primary)] font-medium text-sm ${getStatusToneClass(
          status,
        )}`}
      >
        {renderStatusIcon(status)}
        {title}
      </div>
      <div className="px-4 py-3 bg-[var(--bg-card)] text-sm text-[var(--text-primary)] leading-relaxed">
        {body}
      </div>
    </div>
  );
}

function groupIncidents(incidents: IncidentSummary[]) {
  const monthMap = new Map<
    string,
    {
      monthLabel: string;
      days: Map<
        string,
        {
          dayNumber: string;
          weekdayLabel: string;
          incidents: IncidentSummary[];
        }
      >;
    }
  >();

  for (const incident of incidents) {
    const monthKey = incident.monthKey;
    const dayKey = incident.dateKey;
    const monthGroup =
      monthMap.get(monthKey) ??
      (() => {
        const nextValue = { monthLabel: incident.monthLabel, days: new Map() };
        monthMap.set(monthKey, nextValue);
        return nextValue;
      })();
    const dayGroup =
      monthGroup.days.get(dayKey) ??
      (() => {
        const nextValue = {
          dayNumber: incident.dayNumber,
          weekdayLabel: incident.weekdayLabel,
          incidents: [],
        };
        monthGroup.days.set(dayKey, nextValue);
        return nextValue;
      })();

    dayGroup.incidents.push(incident);
  }

  return [...monthMap.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([, monthGroup]) => ({
      monthLabel: monthGroup.monthLabel,
      days: [...monthGroup.days.entries()]
        .sort((left, right) => right[0].localeCompare(left[0]))
        .map(([, day]) => ({
          ...day,
          incidents: day.incidents.sort(
            (left, right) =>
              new Date(right.startAt).getTime() - new Date(left.startAt).getTime(),
          ),
        })),
    }));
}

function RangeSelector({
  label,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
}: {
  label: string;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const buttonClassName =
    "transition-colors disabled:opacity-40 disabled:cursor-default hover:text-[var(--text-primary)]";

  return (
    <div className="flex items-center gap-2 text-xs sm:text-sm text-[var(--text-secondary)]">
      <button
        type="button"
        onClick={onPrevious}
        disabled={!canGoPrevious}
        aria-label="Previous range"
        className={buttonClassName}
      >
        <ChevronLeft className="w-4 h-4 text-[var(--text-muted)]" />
      </button>
      <span>{label}</span>
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        aria-label="Next range"
        className={buttonClassName}
      >
        <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
      </button>
    </div>
  );
}

function UptimeChart({
  days,
  onSelectIncident,
}: {
  days: UptimeDay[];
  onSelectIncident?: (incidentId: string) => void;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div
      className="relative flex items-center w-full h-[24px]"
      onPointerLeave={() => setHoveredIndex(null)}
    >
      {days.map((day, index) => (
        <div
          key={day.date}
          className={`flex-1 h-full flex items-center justify-center ${
            canOpenIncidentFromDay(day) ? "cursor-pointer" : "cursor-default"
          }`}
          onPointerEnter={() => setHoveredIndex(index)}
          onClick={(event) => {
            event.stopPropagation();
            if (canOpenIncidentFromDay(day) && day.incidentId && onSelectIncident) {
              onSelectIncident(day.incidentId);
            }
          }}
        >
          <div
            className={`w-[2px] sm:w-[3px] md:w-[4px] rounded-[1px] transition-all duration-300 ease-out ${
              hoveredIndex === index
                ? "h-[18px] opacity-100"
                : hoveredIndex === null
                  ? "h-[12px] opacity-100"
                  : "h-[12px] opacity-30"
            } ${
              day.status === "down"
                ? hoveredIndex === index
                  ? "bg-[var(--status-down-icon)] shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                  : "bg-[var(--status-down-icon)]"
                : day.status === "degraded"
                  ? hoveredIndex === index
                    ? "bg-[var(--status-deg-icon)] shadow-[0_0_8px_rgba(245,158,11,0.6)]"
                    : "bg-[var(--status-deg-icon)]"
                : day.status === "operational"
                  ? hoveredIndex === index
                    ? "bg-[var(--status-op-icon)] shadow-[0_0_8px_rgba(31,163,130,0.6)]"
                    : "bg-[var(--status-op-icon)]"
                  : hoveredIndex === index
                    ? "bg-[var(--chart-empty-hover)]"
                    : "bg-[var(--chart-empty)]"
            }`}
          />
        </div>
      ))}

      <AnimatePresence>
        {hoveredIndex !== null && (
          <motion.div
            initial={{
              opacity: 0,
              y: 8,
              scale: 0.95,
              left: `${((hoveredIndex + 0.5) / days.length) * 100}%`,
              x: "-50%",
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              left: `${((hoveredIndex + 0.5) / days.length) * 100}%`,
              x: "-50%",
            }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
            className="absolute bottom-[32px] z-50 pointer-events-none flex flex-col items-center"
          >
            <motion.div
              layout
              className="w-max min-w-[140px] bg-[var(--chart-tooltip-bg)] border border-[var(--chart-tooltip-border)] text-[var(--text-primary)] text-xs rounded-md shadow-xl overflow-hidden"
            >
              <div className="py-2 px-3 flex flex-col items-center gap-1">
                <motion.span layout="position" className="text-[var(--text-secondary)] font-medium">
                  {days[hoveredIndex].date}
                </motion.span>
                <div className="text-[var(--text-primary)] text-center w-full relative flex flex-col items-center">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.div
                      layout
                      key={getTooltipLayoutKey(days[hoveredIndex])}
                      initial={{ opacity: 0, filter: "blur(4px)", scale: 0.95 }}
                      animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
                      exit={{ opacity: 0, filter: "blur(4px)", scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="flex flex-col items-center justify-center gap-0.5 w-full"
                    >
                      {days[hoveredIndex].status === "operational" ? (
                        <div className="flex items-center gap-1.5">
                          <StatusIcon className="w-3.5 h-3.5 text-[var(--status-op-icon)] fill-current" />
                          Operational
                        </div>
                      ) : days[hoveredIndex].status === "down" ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <svg
                              viewBox="0 0 24 24"
                              className="w-3.5 h-3.5 text-[var(--status-down-icon)] fill-current"
                            >
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                            </svg>
                            <span>{days[hoveredIndex].label ?? "Major outage"}</span>
                          </div>
                          {days[hoveredIndex].duration ? (
                            <span className="text-[var(--text-secondary)] text-[10px] font-normal leading-none pb-0.5">
                              Down for {days[hoveredIndex].duration}
                            </span>
                          ) : null}
                        </div>
                      ) : days[hoveredIndex].status === "degraded" ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-[var(--status-deg-icon)]" />
                            <span>{days[hoveredIndex].label ?? "Degraded Performance"}</span>
                          </div>
                          {days[hoveredIndex].duration ? (
                            <span className="text-[var(--text-secondary)] text-[10px] font-normal leading-none pb-0.5">
                              Impact lasted {days[hoveredIndex].duration}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <div>No data available</div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
            <motion.div
              layout="position"
              className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-[var(--chart-tooltip-bg)]"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function IncidentPage({
  incident,
  onBack,
  onGoHome,
}: {
  incident: IncidentSummary;
  onBack: () => void;
  onGoHome: () => void;
}) {
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);

  return (
    <motion.div
      key="incident"
      initial={{ opacity: 0, filter: "blur(8px)", scale: 0.98 }}
      animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
      exit={{ opacity: 0, filter: "blur(8px)", scale: 0.98 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex flex-col gap-8"
    >
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <button onClick={onGoHome} className="hover:text-[var(--text-primary)] transition-colors">
          {siteConfig.brand.shortName}
        </button>
        <span>/</span>
        <button onClick={onBack} className="hover:text-[var(--text-primary)] transition-colors">
          History
        </button>
        <span>/</span>
        <span className="text-[var(--text-primary)] truncate max-w-[200px] sm:max-w-[300px]">
          {incident.title}
        </span>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:gap-4 pb-2">
          <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)] tracking-tight">
            {incident.title}
          </h1>
          <div className="flex items-center gap-3 text-sm">
            <span className="px-3 py-1 bg-[var(--status-op-bg)] text-[var(--status-op-text)] rounded-full font-medium text-xs">
              {incident.statusLabel}
            </span>
            <span className="text-[var(--text-secondary)]">{incident.dateLabel}</span>
          </div>
        </div>

        <div className="border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-card)] flex flex-col">
          <div className="px-4 sm:px-5 py-3 sm:py-4 text-sm sm:text-base font-medium text-[var(--text-primary)]">
            Affected components
          </div>
          <div className="px-4 sm:px-5 py-2.5 sm:py-3 border-y border-[var(--border-subtle)] flex justify-between items-center text-xs sm:text-sm text-[var(--text-secondary)]">
            <span>{incident.affectedRangeStartLabel}</span>
            <span>{incident.affectedRangeEndLabel}</span>
          </div>
          <div className="px-4 sm:px-5 py-4 sm:py-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span className="font-medium text-[var(--text-primary)]">{incident.componentLabel}</span>
              <span className="text-[var(--text-secondary)]">{incident.componentCountLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--text-secondary)]" />
            </div>
            <div
              className="relative flex gap-1 h-3 w-full"
              onPointerLeave={() => setHoveredSegment(null)}
            >
              {incident.segments.map((segment, index) => (
                <div
                  key={`${segment.statusLabel}-${index}`}
                  className={`${getToneClass(segment.tone)} h-full cursor-pointer transition-opacity ${
                    hoveredSegment !== null && hoveredSegment !== index ? "opacity-50" : "opacity-100"
                  }`}
                  style={{ width: segment.width }}
                  onPointerEnter={() => setHoveredSegment(index)}
                />
              ))}

              <AnimatePresence>
                {hoveredSegment !== null && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95, x: "-50%" }}
                    animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
                    exit={{ opacity: 0, y: 8, scale: 0.95, x: "-50%" }}
                    transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
                    className="absolute bottom-[20px] z-50 pointer-events-none flex flex-col items-center"
                    style={{ left: incident.segments[hoveredSegment].center }}
                  >
                    <div className="w-max min-w-[140px] bg-[var(--chart-tooltip-bg)] border border-[var(--chart-tooltip-border)] text-[var(--text-primary)] text-xs rounded-md shadow-xl overflow-hidden py-2 px-3 flex flex-col items-center gap-1">
                      <span className="text-[var(--text-secondary)] font-medium">
                        {incident.segments[hoveredSegment].timeLabel}
                      </span>
                      <div className="flex items-center gap-1.5 text-[var(--text-primary)]">
                        {incident.segments[hoveredSegment].tone === "operational" ? (
                          <StatusIcon className="w-3.5 h-3.5 text-[var(--status-op-icon)] fill-current" />
                        ) : (
                          <div
                            className={`w-3 h-3 rounded-full ${getToneClass(
                              incident.segments[hoveredSegment].tone,
                            )}`}
                          />
                        )}
                        {incident.segments[hoveredSegment].statusLabel}
                      </div>
                    </div>
                    <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-[var(--chart-tooltip-bg)]" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-8 pt-4">
          <div className="flex flex-col gap-8 border-l-2 border-[var(--border-subtle)] ml-2 pl-6 py-2 relative">
            {incident.timeline.map((item) => (
              <div key={`${item.label}-${item.timeLabel}`} className="relative">
                <div
                  className={`absolute w-3 h-3 rounded-full -left-[31px] top-1 ring-4 ring-[var(--bg-main)] ${getToneClass(item.tone)}`}
                />
                <span className="font-medium text-[var(--text-primary)] block mb-0.5">
                  {item.label}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">{item.timeLabel}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function HistoryPage({
  incidents,
  loadError,
  onBack,
  onSelectIncident,
  rangeLabel,
  canGoPreviousRange,
  canGoNextRange,
  onPreviousRange,
  onNextRange,
}: {
  incidents: IncidentSummary[];
  loadError?: StatusPageLoadError;
  onBack: () => void;
  onSelectIncident: (incidentId: string) => void;
  rangeLabel: string;
  canGoPreviousRange: boolean;
  canGoNextRange: boolean;
  onPreviousRange: () => void;
  onNextRange: () => void;
}) {
  const groupedIncidents = groupIncidents(incidents);

  return (
    <motion.div
      key="history"
      initial={{ opacity: 0, filter: "blur(8px)", scale: 0.98 }}
      animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
      exit={{ opacity: 0, filter: "blur(8px)", scale: 0.98 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex flex-col gap-8"
    >
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <button onClick={onBack} className="hover:text-[var(--text-primary)] transition-colors">
          {siteConfig.brand.shortName}
        </button>
        <span>/</span>
        <span className="text-[var(--text-primary)]">History</span>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4 sm:gap-6 border-b border-[var(--border-subtle)] pb-4">
          <h1 className="text-lg sm:text-xl font-semibold text-[var(--text-primary)] tracking-tight">
            History
          </h1>
          <RangeSelector
            label={rangeLabel}
            canGoPrevious={canGoPreviousRange}
            canGoNext={canGoNextRange}
            onPrevious={onPreviousRange}
            onNext={onNextRange}
          />
        </div>

        {groupedIncidents.length === 0 ? (
          loadError ? (
            <NoticeCard
              title={loadError.title}
              body={loadError.body}
              status="maintenance"
            />
          ) : (
            <NoticeCard
              title="We're fully operational"
              body="We're not aware of any issues affecting our systems."
              status="operational"
            />
          )
        ) : (
          <div className="flex flex-col gap-8">
            {groupedIncidents.map((monthGroup) => (
              <div key={monthGroup.monthLabel} className="flex flex-col gap-8">
                <h2 className="text-sm sm:text-base font-medium text-[var(--text-primary)]">
                  {monthGroup.monthLabel}
                </h2>

                <div className="flex flex-col">
                  {monthGroup.days.map((day) => (
                    <div
                      key={`${monthGroup.monthLabel}-${day.dayNumber}-${day.weekdayLabel}`}
                      className="flex gap-4 sm:gap-6 border-b border-[var(--border-subtle)] py-5 sm:py-6 first:pt-0"
                    >
                      <div className="flex gap-1.5 font-medium min-w-[40px] sm:min-w-[50px]">
                        <div className="flex flex-col text-[var(--text-primary)]">
                          <span className="text-sm sm:text-base leading-none">{day.dayNumber}</span>
                          <span className="text-[10px] sm:text-xs mt-1 text-[var(--text-secondary)]">
                            {day.weekdayLabel}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-6 flex-1">
                        {day.incidents.map((incident) => (
                          <div
                            key={incident.id}
                            onClick={() => onSelectIncident(incident.id)}
                            className={`flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4 border-l-[3px] pl-3 sm:pl-4 cursor-pointer group ${getHistoryAccentClass(
                              incident.severity,
                            )}`}
                          >
                            <div className="flex flex-col gap-1.5">
                              <h3
                                className={`text-sm font-medium text-[var(--text-primary)] leading-none transition-colors ${getHistoryHoverClass(
                                  incident.severity,
                                )}`}
                              >
                                {incident.title}
                              </h3>
                              <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                                {incident.summary}
                              </p>
                            </div>
                            <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
                              {incident.historyTimeLabel}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function StatusPageClient({ initialData }: { initialData: StatusPageData }) {
  const [data, setData] = useState(initialData);
  const rangeOptions = buildRangeOptions(data.services);
  const historyIncidents = data.incidents.filter(shouldShowIncidentInHistory);
  const [currentPage, setCurrentPage] = useState<"home" | "history" | "incident">("home");
  const [selectedRangeIndex, setSelectedRangeIndex] = useState(
    Math.max(rangeOptions.length - 1, 0),
  );
  const selectedRange = rangeOptions[selectedRangeIndex] ?? null;
  const visibleHistoryIncidents = selectedRange
    ? historyIncidents.filter((incident) => isDateInRangeOption(incident.dateKey, selectedRange))
    : historyIncidents;
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(
    historyIncidents[0]?.id ?? data.incidents[0]?.id ?? null,
  );
  const [expandedServices, setExpandedServices] = useState<Record<string, boolean>>({});
  const selectedIncident =
    data.incidents.find((incident) => incident.id === selectedIncidentId) ?? null;
  const headline = getHeadline(data);
  const canGoPreviousRange = selectedRangeIndex > 0;
  const canGoNextRange = selectedRangeIndex < rangeOptions.length - 1;

  const refreshLiveStatus = useEffectEvent(async () => {
    try {
      const response = await fetch("/api/status/live", {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        return;
      }

      const liveData = (await response.json()) as LiveStatusPageData;

      startTransition(() => {
        setData((currentData) =>
          hasSameLiveStatus(currentData, liveData)
            ? currentData
            : mergeLiveStatusIntoSnapshot(currentData, liveData),
        );
      });
    } catch {
      // Keep the current snapshot when a background refresh fails.
    }
  });

  useEffect(() => {
    let isRefreshInFlight = false;

    const refreshIfVisible = async () => {
      if (document.visibilityState === "hidden" || isRefreshInFlight) {
        return;
      }

      isRefreshInFlight = true;

      try {
        await refreshLiveStatus();
      } finally {
        isRefreshInFlight = false;
      }
    };

    void refreshIfVisible();

    const intervalId = window.setInterval(() => {
      void refreshIfVisible();
    }, AUTO_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshIfVisible();
      }
    };

    const handleOnline = () => {
      void refreshIfVisible();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
  }, [refreshLiveStatus]);

  useEffect(() => {
    if (selectedRangeIndex < rangeOptions.length) {
      return;
    }

    setSelectedRangeIndex(Math.max(rangeOptions.length - 1, 0));
  }, [rangeOptions.length, selectedRangeIndex]);

  useEffect(() => {
    if (
      selectedIncidentId &&
      data.incidents.some((incident) => incident.id === selectedIncidentId)
    ) {
      return;
    }

    const nextIncidentId = historyIncidents[0]?.id ?? data.incidents[0]?.id ?? null;

    setSelectedIncidentId(nextIncidentId);

    if (currentPage === "incident") {
      setCurrentPage("history");
    }
  }, [currentPage, data.incidents, historyIncidents, selectedIncidentId]);

  const toggleService = (serviceId: string) => {
    if (window.innerWidth < 640) {
      setExpandedServices((previous) => ({
        ...previous,
        [serviceId]: !previous[serviceId],
      }));
    }
  };

  const handleSelectIncident = (incidentId: string) => {
    setSelectedIncidentId(incidentId);
    setCurrentPage("incident");
  };

  const goToPreviousRange = () => {
    if (canGoPreviousRange) {
      setSelectedRangeIndex((previous) => previous - 1);
    }
  };

  const goToNextRange = () => {
    if (canGoNextRange) {
      setSelectedRangeIndex((previous) => previous + 1);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] font-sans selection:bg-[var(--status-op-bg)] flex flex-col transition-colors duration-300">
      <div className="w-full max-w-[718px] mx-auto px-4 py-8 md:py-12 flex flex-col gap-6 flex-1">
        <header className="flex items-center justify-between min-h-[36px] mb-2">
          <a
            href="#"
            onClick={(event) => {
              event.preventDefault();
              setCurrentPage("home");
            }}
            className="block h-7 w-7 overflow-hidden rounded-full"
          >
            <Image
              src={siteConfig.brand.logoPath}
              alt={siteConfig.brand.shortName}
              width={28}
              height={28}
              priority
              className="h-full w-full object-cover"
            />
          </a>
          <div className="flex items-center gap-4">
            <a
              href={siteConfig.brand.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              title="Open website"
            >
              <Globe className="w-4 h-4" />
            </a>
            <a
              href="/feed.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              title="RSS Feed"
              type="application/rss+xml"
            >
              <Rss className="w-4 h-4" />
            </a>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {currentPage === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0, filter: "blur(8px)", scale: 0.98 }}
              animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
              exit={{ opacity: 0, filter: "blur(8px)", scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex flex-col gap-6"
            >
              <div className={`rounded-lg ${getStatusCardClass(headline.status)} overflow-hidden shadow-[var(--card-shadow)]`}>
                <div className={`px-4 py-3 flex items-center gap-2 text-[var(--text-primary)] font-medium text-sm ${headline.toneClass}`}>
                  {renderStatusIcon(headline.status)}
                  {headline.title}
                </div>
                <div className="px-4 py-3 bg-[var(--bg-card)] text-sm text-[var(--text-primary)] leading-relaxed">
                  {headline.body}
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] shadow-[var(--card-shadow)]">
                <div className="px-4 py-3 flex items-center justify-between sm:justify-start sm:gap-4 border-b border-[var(--border-strong)]">
                  <h2 className="font-medium text-[var(--text-primary)] text-base">System status</h2>
                  <div>
                    <RangeSelector
                      label={selectedRange?.label ?? data.rangeLabel}
                      canGoPrevious={canGoPreviousRange}
                      canGoNext={canGoNextRange}
                      onPrevious={goToPreviousRange}
                      onNext={goToNextRange}
                    />
                  </div>
                </div>

                {data.services.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-[var(--text-secondary)]">
                    {data.loadError?.body ?? "No monitoring data is available right now."}
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-strong)]">
                    {data.services.map((service: ServiceStatusCard) => (
                      <div
                        key={service.id}
                        className="p-4 cursor-pointer sm:cursor-default"
                        onClick={() => toggleService(service.id)}
                      >
                        <div className="flex items-center justify-between sm:mb-2">
                          <div className="flex items-center gap-2">
                            {renderStatusIcon(service.status)}
                            <div className="flex items-center gap-1.5 group">
                              <h3 className="font-medium text-sm text-[var(--text-primary)]">
                                {service.name}
                              </h3>
                              <ChevronDown
                                className={`sm:hidden w-4 h-4 text-[var(--text-muted)] transition-transform ${
                                  expandedServices[service.id] ? "rotate-180" : ""
                                }`}
                              />
                              {shouldShowExternalLink(service) ? (
                                <a
                                  href={service.externalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              ) : null}
                            </div>
                          </div>
                          <div className="hidden sm:block text-xs text-[var(--text-secondary)]">
                            {service.uptimeLabel}
                          </div>
                        </div>
                        <div className="hidden sm:block">
                          <UptimeChart
                            days={getVisibleRangeDays(service.desktopDays, selectedRange)}
                            onSelectIncident={handleSelectIncident}
                          />
                        </div>
                        <AnimatePresence>
                          {expandedServices[service.id] && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="sm:hidden overflow-hidden"
                            >
                              <div className="pt-4">
                                <div className="flex justify-between items-center mb-2 text-xs text-[var(--text-secondary)]">
                                  <span>{selectedRange?.startLabel ?? "30 days ago"}</span>
                                  <span>{service.uptimeLabel}</span>
                                  <span>{selectedRange?.endLabel ?? "Today"}</span>
                                </div>
                                <UptimeChart
                                  days={getVisibleRangeDays(service.desktopDays, selectedRange)}
                                  onSelectIncident={handleSelectIncident}
                                />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-center mt-4">
                <button
                  onClick={() => setCurrentPage("history")}
                  className="flex items-center gap-2 px-[12px] py-[6px] text-[13px] font-medium text-[var(--btn-text)] bg-[var(--btn-bg)] border border-[var(--btn-border)] rounded-[6px] hover:bg-[var(--btn-hover)] transition-all duration-200 box-border"
                >
                  <Calendar className="w-4 h-4" />
                  View history
                </button>
              </div>
            </motion.div>
          )}

          {currentPage === "history" && (
            <HistoryPage
              key="history"
              incidents={visibleHistoryIncidents}
              loadError={data.loadError}
              onBack={() => setCurrentPage("home")}
              onSelectIncident={handleSelectIncident}
              rangeLabel={selectedRange?.label ?? data.rangeLabel}
              canGoPreviousRange={canGoPreviousRange}
              canGoNextRange={canGoNextRange}
              onPreviousRange={goToPreviousRange}
              onNextRange={goToNextRange}
            />
          )}

          {currentPage === "incident" && selectedIncident && (
            <IncidentPage
              key="incident"
              incident={selectedIncident}
              onBack={() => setCurrentPage("history")}
              onGoHome={() => setCurrentPage("home")}
            />
          )}
        </AnimatePresence>

        <footer className="mt-auto pt-8 pb-4 flex flex-col items-center gap-4 text-xs text-[var(--text-secondary)] text-center px-4">
          <div className="flex items-center gap-1.5 justify-center">
            <span>Powered by</span>
            <span className="font-medium text-[var(--text-primary)] flex items-center gap-1">
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 fill-current"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
              {siteConfig.brand.siteName}
            </span>
          </div>
          <p className="text-[var(--text-muted)]">
            {siteConfig.brand.footerText}
          </p>
        </footer>
      </div>
    </div>
  );
}
