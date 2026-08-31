/** Public Schedule / Live projection, mirrored from entries_site.py. */
import type { PersonReferenceDTO } from "./person.types";
export type ScheduleState =
  | "scheduled"
  | "called"
  | "live"
  | "delayed"
  | "completed"
  | "walkover"
  | "retired"
  | "cancelled";

export interface ScheduleDayFacetDTO {
  day: string;
  count: number;
}

export interface ScheduleSideDTO {
  participantKey: string | null;
  /** Ordered identities on this side. A dead ref is deliberately unlinked. */
  persons: PersonReferenceDTO[];
  placeholder: string | null;
  seed?: number | null;
}

export interface ScheduleMatchDTO {
  matchKey: string;
  source: "bracket" | "meet";
  eventCode: string;
  discipline: string | null;
  roundLabel: string | null;
  status: ScheduleState;
  scheduledDate: string | null;
  scheduledTime: string | null;
  court: number | null;
  sides: ScheduleSideDTO[];
  score: number[][] | null;
  walkover: boolean;
  updatedAt: string | null;
}

export interface ScheduleFacetsDTO {
  days: ScheduleDayFacetDTO[];
  events: string[];
  courts: number[];
  states: ScheduleState[];
}

export interface ScheduleMatchesDTO {
  published: boolean;
  items: ScheduleMatchDTO[];
  facets: ScheduleFacetsDTO;
  page: number;
  pageSize: number;
  total: number;
  timeZone: string;
  updatedAt: string | null;
  revision: string;
}

export const SCHEDULE_STATES: readonly ScheduleState[] = Object.freeze([
  "scheduled",
  "called",
  "live",
  "delayed",
  "completed",
  "walkover",
  "retired",
  "cancelled",
]);

export function scheduleStateLabel(state: ScheduleState): string {
  switch (state) {
    case "scheduled":
      return "Scheduled";
    case "called":
      return "Called";
    case "live":
      return "Live now";
    case "delayed":
      return "Delayed";
    case "completed":
      return "Completed";
    case "walkover":
      return "Walkover";
    case "retired":
      return "Retired";
    case "cancelled":
      return "Cancelled";
  }
}

/** A server timestamp older than this should be explained to a spectator. */
export function scheduleIsStale(
  updatedAt: string | null,
  now = Date.now(),
): boolean {
  if (!updatedAt) return false;
  const parsed = Date.parse(updatedAt);
  return Number.isFinite(parsed) && now - parsed > 30 * 60 * 1000;
}

export function scheduleDateLabel(day: string): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}
