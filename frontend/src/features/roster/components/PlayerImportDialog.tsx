import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { PlayerDTO, RosterGroupDTO } from '../../../api/dto';

interface PlayerImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (players: PlayerDTO[], groups: RosterGroupDTO[]) => void;
  existingGroups: RosterGroupDTO[];
}

interface ParsedPlayer {
  name: string;
  schoolName: string;
}

/**
 * PlayerImportDialog Component
 *
 * Simple CSV import for players with just name and school.
 *
 * CSV Format:
 * Name,School
 * Mei Lin,Crescent Lake HS
 * Devansh Patel,North Ridge Academy
 */
export function PlayerImportDialog({ isOpen, onClose, onImport, existingGroups }: PlayerImportDialogProps) {
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<ParsedPlayer[]>([]);
  const [error, setError] = useState<string>('');
  const [separatorType, setSeparatorType] = useState<'auto' | 'tab' | 'comma'>('auto');

  const handleParse = () => {
    setError('');
    setPreview([]);

    if (!csvText.trim()) {
      setError('Please paste data from spreadsheet');
      return;
    }

    try {
      const lines = csvText.trim().split('\n');
      const parsed: ParsedPlayer[] = [];
      const skippedLines: string[] = [];

      // Determine separator based on user selection or auto-detect
      let separator: string;
      if (separatorType === 'auto') {
        const firstLine = lines[0];
        separator = firstLine.includes('\t') ? '\t' : ',';
      } else if (separatorType === 'tab') {
        separator = '\t';
      } else {
        separator = ',';
      }

      // Skip header row (first line)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines

        // Split by detected separator, handle quoted fields
        const parts = line.split(separator).map(p => p.trim().replace(/^["']|["']$/g, ''));

        if (parts.length < 2) {
          // Skip this line and track it
          skippedLines.push(`Line ${i + 1}: "${line.substring(0, 50)}${line.length > 50 ? '...' : ''}" (missing separator)`);
          continue;
        }

        const [name, schoolName] = parts;

        // Clean up name and school (trim extra spaces, preserve single spaces between words)
        const cleanName = name.replace(/\s+/g, ' ').trim();
        const cleanSchool = schoolName.replace(/\s+/g, ' ').trim();

        if (!cleanName || !cleanSchool) {
          // Skip this line and track it
          skippedLines.push(`Line ${i + 1}: "${line.substring(0, 50)}${line.length > 50 ? '...' : ''}" (empty name or school)`);
          continue;
        }

        parsed.push({ name: cleanName, schoolName: cleanSchool });
      }

      if (parsed.length === 0) {
        setError('No valid player data found. ' + (skippedLines.length > 0 ? `\n\nSkipped ${skippedLines.length} line(s):\n${skippedLines.slice(0, 5).join('\n')}` : ''));
        return;
      }

      // Show warning if lines were skipped, but still allow preview
      if (skippedLines.length > 0) {
        setError(`[Warning] Warning: Skipped ${skippedLines.length} line(s) with formatting issues. Successfully parsed ${parsed.length} players.\n\n${skippedLines.slice(0, 3).join('\n')}${skippedLines.length > 3 ? `\n... and ${skippedLines.length - 3} more` : ''}`);
      }

      setPreview(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse data');
    }
  };

  const handleImport = () => {
    if (preview.length === 0) return;

    // Get unique school names
    const uniqueSchools = Array.from(new Set(preview.map(p => p.schoolName)));

    // Map school names to group IDs (use existing or create new)
    const schoolMap = new Map<string, string>();
    const newGroups: RosterGroupDTO[] = [];

    uniqueSchools.forEach(schoolName => {
      // Check if school already exists
      const existing = existingGroups.find(g => g.name.toLowerCase() === schoolName.toLowerCase());

      if (existing) {
        schoolMap.set(schoolName, existing.id);
      } else {
        // Create new group
        const newGroupId = uuidv4();
        schoolMap.set(schoolName, newGroupId);
        newGroups.push({
          id: newGroupId,
          name: schoolName,
        });
      }
    });

    // Create players
    const players: PlayerDTO[] = preview.map(p => ({
      id: uuidv4(),
      name: p.name,
      groupId: schoolMap.get(p.schoolName)!,
      ranks: [],
      availability: [],
    }));

    onImport(players, newGroups);
    handleClose();
  };

  const handleClose = () => {
    setCsvText('');
    setPreview([]);
    setError('');
    setSeparatorType('auto');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal overflow-y-auto">
      <div className="flex items-center justify-center min-h-[100dvh] px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Overlay */}
        <div className="fixed inset-0 transition-opacity bg-foreground/50" onClick={handleClose} />

        {/* Dialog */}
        <div className="inline-block w-full max-w-4xl p-4 my-8 overflow-hidden text-left align-middle transition-all transform bg-card shadow rounded">
          <h3 className="text-base font-semibold text-foreground mb-3">Import Players from Spreadsheet</h3>

          <div className="space-y-3">
            {/* Instructions */}
            <div className="p-2 bg-blue-50 border border-blue-200 rounded-sm text-sm">
              <p className="font-medium text-blue-900 mb-1">How to Import:</p>
              <ol className="text-blue-800 text-xs space-y-1 ml-4 list-decimal">
                <li><strong>From Google Sheets/Excel:</strong> Copy the columns (Name, School) and paste directly</li>
                <li><strong>From CSV file:</strong> Use comma-separated format (Name,School)</li>
              </ol>
              <pre className="text-blue-800 font-mono text-xs mt-2 bg-card p-2 rounded">
{`Name	School
Mei Lin	Crescent Lake HS
Devansh Patel	North Ridge Academy
Aria Okafor	Bayshore Prep`}
              </pre>
              <ul className="text-blue-700 mt-2 text-xs list-disc list-inside">
                <li>Automatically detects tabs (from spreadsheets) or commas (from CSV)</li>
                <li>First row must be the header</li>
                <li>New schools created automatically</li>
                <li>Existing schools matched by name</li>
              </ul>
            </div>

            {/* Separator Selection */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Column Separator
              </label>
              <div className="flex gap-4">
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    value="auto"
                    checked={separatorType === 'auto'}
                    onChange={(e) => setSeparatorType(e.target.value as 'auto')}
                    className="w-4 h-4 text-blue-600 border-border focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-foreground">Auto-detect</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    value="tab"
                    checked={separatorType === 'tab'}
                    onChange={(e) => setSeparatorType(e.target.value as 'tab')}
                    className="w-4 h-4 text-blue-600 border-border focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-foreground">Tab (from spreadsheet)</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    value="comma"
                    checked={separatorType === 'comma'}
                    onChange={(e) => setSeparatorType(e.target.value as 'comma')}
                    className="w-4 h-4 text-blue-600 border-border focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-foreground">Comma (CSV file)</span>
                </label>
              </div>
            </div>

            {/* CSV/TSV Input */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Paste Data (from Google Sheets, Excel, or CSV)
              </label>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="Copy from spreadsheet and paste here...&#10;&#10;Name	School&#10;Mei Lin	Crescent Lake HS&#10;Devansh Patel	North Ridge Academy"
                rows={6}
                className="w-full px-2 py-1.5 border border-border rounded-sm font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Tip: In Google Sheets, select the Name and School columns, press Ctrl+C, then paste here
              </p>
            </div>

            {/* Parse Button */}
            <button
              onClick={handleParse}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-sm text-sm hover:bg-blue-700"
            >
              Preview Import
            </button>

            {/* Error */}
            {error && (
              <div className="p-2 bg-red-50 border border-red-200 rounded-sm text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Preview */}
            {preview.length > 0 && (
              <div>
                <h4 className="font-medium text-foreground mb-2 text-sm">
                  Preview: {preview.length} players to import
                </h4>
                <div className="border border-border rounded-sm overflow-hidden max-h-48 overflow-y-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Name</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">School</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                      {preview.map((player, idx) => {
                        const schoolExists = existingGroups.some(g =>
                          g.name.toLowerCase() === player.schoolName.toLowerCase()
                        );
                        return (
                          <tr key={idx}>
                            <td className="px-4 py-2 text-sm text-foreground">{player.name}</td>
                            <td className="px-4 py-2 text-sm text-foreground">{player.schoolName}</td>
                            <td className="px-4 py-2 text-sm">
                              {schoolExists ? (
                                <span className="text-green-600">Existing school</span>
                              ) : (
                                <span className="text-blue-600">New school</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Schools: {Array.from(new Set(preview.map(p => p.schoolName))).join(', ')}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-4 flex gap-2 justify-end">
            <button
              onClick={handleClose}
              className="px-3 py-1.5 bg-muted text-foreground rounded-sm text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Cancel
            </button>
            {preview.length > 0 && (
              <button
                onClick={handleImport}
                className="px-3 py-1.5 bg-green-600 text-white rounded-sm text-sm hover:bg-green-700 font-medium"
              >
                Import {preview.length} Players
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
