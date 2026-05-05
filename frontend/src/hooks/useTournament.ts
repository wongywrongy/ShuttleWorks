import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { TournamentDTO } from "../types";

const POLL_MS = 2500;

export function useTournament() {
  const [data, setData] = useState<TournamentDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetch = useRef(0);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const d = await api.get();
      setData(d);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("404")) {
        setData(null);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
      lastFetch.current = Date.now();
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (Date.now() - lastFetch.current >= POLL_MS - 100) refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, setData, loading, error, refresh };
}
