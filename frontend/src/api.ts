import type {
  CreateTournamentIn,
  ScheduleNextOut,
  TournamentDTO,
  WinnerSide,
} from "./types";

const BASE = "";

async function call<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const r = await fetch(BASE + path, {
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
};
