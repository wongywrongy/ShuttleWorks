/**
 * Tournament File Management Component
 * Handles export/import of complete tournament data (config, players, matches, schedule, match states).
 *
 * The two `apiClient.{get,importBulk}MatchStates` calls stay inline
 * intentionally: this component IS the one-off orchestrator for the
 * JSON export/import workflow, and the conventions explicitly allow a
 * one-off page-level component to own its fetches. Extracting them
 * into a hook would put two trivial wrappers in a separate file with
 * no other consumer.
 */
import { useState } from 'react';
import { useTournamentStore } from '../../store/tournamentStore';
import { apiClient } from '../../api/client';
import type { TournamentExportV2, MatchStateDTO } from '../../api/dto';
import { Button } from '@scheduler/design-system';
import { Section } from '../settings/SettingsPrimitives';
import { useTournamentId } from '../../hooks/useTournamentId';

export function TournamentFileManagement() {
  const tid = useTournamentId();
  const config = useTournamentStore((state) => state.config);
  const players = useTournamentStore((state) => state.players);
  const matches = useTournamentStore((state) => state.matches);
  const schedule = useTournamentStore((state) => state.schedule);
  const setConfig = useTournamentStore((state) => state.setConfig);
  const setPlayers = useTournamentStore((state) => state.setPlayers);
  const setMatches = useTournamentStore((state) => state.setMatches);
  const setSchedule = useTournamentStore((state) => state.setSchedule);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleExport = async () => {
    try {
      setExporting(true);
      setMessage(null);

      // Fetch match states from backend (if they exist)
      let matchStates: Record<string, MatchStateDTO> = {};
      try {
        matchStates = await apiClient.getMatchStates(tid);
      } catch (err) {
        // Match states might not exist yet - that's okay
        console.warn('Could not fetch match states:', err);
      }

      const exportData: TournamentExportV2 = {
        version: '2.0',
        exportedAt: new Date().toISOString(),
        config: config!,
        players,
        matches,
        schedule: schedule || undefined,
        matchStates: Object.keys(matchStates).length > 0 ? matchStates : undefined,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tournament_${config?.tournamentDate || new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setMessage({ type: 'success', text: 'Tournament data exported successfully!' });
    } catch (err) {
      console.error('Export error:', err);
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to export tournament data'
      });
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      setMessage(null);

      const text = await file.text();
      const data: TournamentExportV2 = JSON.parse(text);

      // Validate version
      if (data.version !== '2.0') {
        throw new Error('Unsupported file version. Please use a newer export.');
      }

      // Validate required fields
      if (!data.config || !data.players || !data.matches) {
        throw new Error('Invalid tournament file: missing required data');
      }

      // Load into store
      setConfig(data.config);
      setPlayers(data.players);
      setMatches(data.matches);
      if (data.schedule) {
        setSchedule(data.schedule);
      }

      // Import match states to backend (if they exist)
      if (data.matchStates && Object.keys(data.matchStates).length > 0) {
        try {
          await apiClient.importMatchStatesBulk(tid, data.matchStates);
        } catch (err) {
          console.warn('Could not import match states:', err);
        }
      }

      setMessage({
        type: 'success',
        text: `Imported ${data.players.length} players and ${data.matches.length} matches.`
      });

      // Clear the file input
      event.target.value = '';
    } catch (err) {
      console.error('Import error:', err);
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to import tournament data'
      });
    } finally {
      setImporting(false);
    }
  };

  const hasData = config && (players.length > 0 || matches.length > 0);

  return (
    <Section
      title="Export & import"
      description="Save the whole tournament (config, roster, matches, schedule, match states) as a single JSON file, or load one back."
    >
      {message && (
        <div
          className={`rounded-sm p-2 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-destructive/10 border border-destructive/20 text-destructive'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          onClick={handleExport}
          disabled={!hasData || exporting}
          size="sm"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {exporting ? 'Exporting…' : 'Export'}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          disabled={importing}
          asChild
        >
          <label className="cursor-pointer">
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {importing ? 'Importing…' : 'Import'}
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              disabled={importing}
              className="hidden"
            />
          </label>
        </Button>
      </div>

      {!hasData && (
        <div className="flex items-center gap-1.5 rounded-sm border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          No data to export yet
        </div>
      )}
    </Section>
  );
}
