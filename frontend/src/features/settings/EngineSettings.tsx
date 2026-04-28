/**
 * Engine settings — solver tuning + reproducibility.
 *
 * Lives in its own Setup section so tournament-shape config
 * (schedule, players, events) and engine-shape config (solver
 * knobs) don't compete for space in one giant form. Reads and
 * writes the same ``TournamentConfig`` as the Tournament form;
 * the four engine fields are persisted alongside everything else.
 *
 * Fields:
 *   - Reproducible run + seed (deterministic mode)
 *   - Solver time limit (5-120 s)
 *   - Candidate alternatives (1-20)
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { useLockGuard } from '../../hooks/useLockGuard';
import { useTournament } from '../../hooks/useTournament';
import type { TournamentConfig } from '../../api/dto';

interface EngineFormState {
  deterministic: boolean;
  randomSeed: number;
  solverTimeLimitSeconds: number;
  candidatePoolSize: number;
}

const DEFAULTS: EngineFormState = {
  deterministic: false,
  randomSeed: 42,
  solverTimeLimitSeconds: 30,
  candidatePoolSize: 5,
};

export function EngineSettings() {
  const { config, updateConfig } = useTournament();
  const { confirmUnlock } = useLockGuard();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState<EngineFormState>({
    deterministic: config?.deterministic ?? DEFAULTS.deterministic,
    randomSeed: config?.randomSeed ?? DEFAULTS.randomSeed,
    solverTimeLimitSeconds: config?.solverTimeLimitSeconds ?? DEFAULTS.solverTimeLimitSeconds,
    candidatePoolSize: config?.candidatePoolSize ?? DEFAULTS.candidatePoolSize,
  });

  // Adopt incoming config changes that originated outside this pane
  // (e.g. the tournament form saved). If the user has drifted any
  // field locally we leave it alone — same convention as
  // TournamentConfigForm so a save in another section doesn't clobber
  // pending edits here.
  useEffect(() => {
    if (!config) return;
    setForm((prev) => ({
      deterministic: prev.deterministic === DEFAULTS.deterministic ? (config.deterministic ?? DEFAULTS.deterministic) : prev.deterministic,
      randomSeed: prev.randomSeed === DEFAULTS.randomSeed ? (config.randomSeed ?? DEFAULTS.randomSeed) : prev.randomSeed,
      solverTimeLimitSeconds: prev.solverTimeLimitSeconds === DEFAULTS.solverTimeLimitSeconds ? (config.solverTimeLimitSeconds ?? DEFAULTS.solverTimeLimitSeconds) : prev.solverTimeLimitSeconds,
      candidatePoolSize: prev.candidatePoolSize === DEFAULTS.candidatePoolSize ? (config.candidatePoolSize ?? DEFAULTS.candidatePoolSize) : prev.candidatePoolSize,
    }));
  }, [config]);

  if (!config) {
    return (
      <div className="text-xs text-muted-foreground">
        Save the tournament config first — engine settings persist alongside it.
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirmUnlock()) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next: TournamentConfig = {
        ...config,
        deterministic: form.deterministic,
        randomSeed: form.randomSeed,
        solverTimeLimitSeconds: form.solverTimeLimitSeconds,
        candidatePoolSize: form.candidatePoolSize,
      };
      await updateConfig(next);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save engine settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Solver behaviour</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            How the CP-SAT engine searches for a schedule. Defaults work well for typical tournaments; tune up the time limit when you need a tighter solution.
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          {/* Reproducible run */}
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md">
            <input
              type="checkbox"
              id="deterministic"
              checked={form.deterministic}
              onChange={(e) => setForm({ ...form, deterministic: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <div className="flex-1">
              <Label htmlFor="deterministic" className="cursor-pointer">
                Reproducible run
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Single-worker mode with a fixed seed — same input always produces the same schedule. ~3× slower than parallel mode.
              </p>
              {form.deterministic && (
                <div className="mt-2 flex items-center gap-2">
                  <Label className="text-xs">Seed</Label>
                  <Input
                    type="number"
                    value={form.randomSeed}
                    onChange={(e) => setForm({ ...form, randomSeed: parseInt(e.target.value || '42', 10) })}
                    className="h-8 w-24"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Solver time limit */}
          <div className="p-3 bg-muted/50 rounded-md">
            <Label htmlFor="solverTimeLimitSeconds">Solver time limit</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              Maximum wall-clock seconds the solver may spend. Higher = closer to optimal at the cost of operator wait time.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="range"
                id="solverTimeLimitSeconds"
                value={form.solverTimeLimitSeconds}
                onChange={(e) => setForm({ ...form, solverTimeLimitSeconds: parseInt(e.target.value, 10) })}
                className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                min={5}
                max={120}
                step={5}
              />
              <span className="text-xs font-medium w-12 tabular-nums text-right">
                {form.solverTimeLimitSeconds}s
              </span>
            </div>
          </div>

          {/* Candidate pool size */}
          <div className="p-3 bg-muted/50 rounded-md">
            <Label htmlFor="candidatePoolSize">Candidate alternatives</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              Top-N near-optimal alternative schedules to keep alongside the chosen one. Operator can swap to one in a click during play — no re-solve needed.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="range"
                id="candidatePoolSize"
                value={form.candidatePoolSize}
                onChange={(e) => setForm({ ...form, candidatePoolSize: parseInt(e.target.value, 10) })}
                className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                min={1}
                max={20}
                step={1}
              />
              <span className="text-xs font-medium w-8 tabular-nums text-right">
                {form.candidatePoolSize}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className={`${INTERACTIVE_BASE} rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground`}
        >
          {saving ? 'Saving…' : 'Save engine settings'}
        </button>
        {saved && (
          <span className="text-xs text-green-700 dark:text-green-300">Saved.</span>
        )}
        {error && (
          <span className="text-xs text-red-700 dark:text-red-300">{error}</span>
        )}
      </div>
    </form>
  );
}
