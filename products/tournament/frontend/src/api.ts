import type {
  CreateTournamentIn,
  ScheduleNextOut,
  TournamentDTO,
  WinnerSide,
} from "./types";

async function call<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const r = await fetch(path, {
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!r.ok) {
    let detail: string;
    try {
      detail = (await r.json()).detail ?? r.statusText;
    } catch {
      detail = r.statusText;
    }
    throw new Error(`${r.status} ${detail}`);
  }
  return (await r.json()) as T;
}

export const api = {
  health: () => call<{ ok: boolean; loaded: boolean }>("/healthz"),
  get: () => call<TournamentDTO>("/tournament"),
  create: (body: CreateTournamentIn) =>
    call<TournamentDTO>("/tournament", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  remove: () =>
    call<{ ok: boolean }>("/tournament", { method: "DELETE" }),
  scheduleNext: () =>
    call<ScheduleNextOut>("/tournament/schedule-next", { method: "POST" }),
  recordResult: (body: {
    play_unit_id: string;
    winner_side: Exclude<WinnerSide, "none">;
    finished_at_slot?: number | null;
    walkover?: boolean;
  }) =>
    call<TournamentDTO>("/tournament/results", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  matchAction: (body: {
    play_unit_id: string;
    action: "start" | "finish" | "reset";
    slot?: number;
  }) =>
    call<TournamentDTO>("/tournament/match-action", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  importJson: (body: unknown) =>
    call<TournamentDTO>("/tournament/import", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  importCsv: async (
    text: string,
    params: {
      courts: number;
      total_slots: number;
      interval_minutes: number;
      rest_between_rounds: number;
      start_time?: string;
    }
  ) => {
    const usp = new URLSearchParams();
    usp.set("courts", String(params.courts));
    usp.set("total_slots", String(params.total_slots));
    usp.set("interval_minutes", String(params.interval_minutes));
    usp.set("rest_between_rounds", String(params.rest_between_rounds));
    if (params.start_time) usp.set("start_time", params.start_time);
    const r = await fetch(`/tournament/import.csv?${usp}`, {
      method: "POST",
      headers: { "content-type": "text/csv" },
      body: text,
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return (await r.json()) as TournamentDTO;
  },
  exportJsonUrl: () => "/tournament/export.json",
  exportCsvUrl: () => "/tournament/export.csv",
  exportIcsUrl: () => "/tournament/export.ics",
};
