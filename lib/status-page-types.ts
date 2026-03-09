export type SystemStatus = "operational" | "degraded" | "outage" | "maintenance";
export type ChartStatus = "operational" | "degraded" | "down" | "nodata";
export type IncidentTone = "operational" | "degraded" | "outage";
export type IncidentState = "resolved" | "investigating";

export interface UptimeDay {
  date: string;
  status: ChartStatus;
  duration?: string;
  label?: string;
  incidentId?: string;
}

export interface ServiceStatusCard {
  id: string;
  name: string;
  externalUrl: string;
  allowExternalLink: boolean;
  status: SystemStatus;
  uptimeLabel: string;
  desktopDays: UptimeDay[];
  mobileDays: UptimeDay[];
}

export interface IncidentSegment {
  width: string;
  center: string;
  tone: IncidentTone;
  statusLabel: string;
  timeLabel: string;
}

export interface IncidentTimelineItem {
  label: string;
  timeLabel: string;
  tone: IncidentTone;
}

export interface IncidentSummary {
  id: string;
  serviceId: string;
  serviceName: string;
  monthKey: string;
  dateKey: string;
  title: string;
  summary: string;
  status: IncidentState;
  severity: Exclude<IncidentTone, "operational">;
  statusLabel: string;
  dateLabel: string;
  monthLabel: string;
  dayNumber: string;
  weekdayLabel: string;
  historyTimeLabel: string;
  affectedRangeStartLabel: string;
  affectedRangeEndLabel: string;
  componentLabel: string;
  componentCountLabel: string;
  segments: IncidentSegment[];
  timeline: IncidentTimelineItem[];
  startAt: string;
  endAt: string;
}

export interface StatusPageData {
  generatedAt: string;
  systemStatus: SystemStatus;
  rangeLabel: string;
  services: ServiceStatusCard[];
  incidents: IncidentSummary[];
}
