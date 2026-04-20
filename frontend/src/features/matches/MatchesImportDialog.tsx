import { useState, type FormEvent } from 'react';
import type { MatchesImportDTO } from '../../api/dto';

interface MatchesImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: MatchesImportDTO) => Promise<void>;
}

export function MatchesImportDialog({ isOpen, onClose, onImport }: MatchesImportDialogProps) {
  const [csvContent, setCsvContent] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!csvContent.trim()) {
      setError('CSV content is required');
      return;
    }

    try {
      setImporting(true);
      setError(null);
      await onImport({ csv: csvContent });
      setCsvContent('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import matches');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded shadow p-4 max-w-2xl w-full mx-4">
        <h3 className="text-base font-semibold mb-3">Import Matches from CSV</h3>

        {error && (
          <div className="mb-3 p-2 bg-red-100 border border-red-400 text-red-700 rounded-sm text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="block text-sm font-medium text-foreground mb-1">
              CSV Content (format: id,eventCode,sideA,sideB,durationSlots,preferredCourt,tags)
            </label>
            <textarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              className="w-full px-2 py-1.5 border border-border rounded-sm font-mono text-sm"
              rows={8}
              placeholder="match1,MD10,player1 player2,player3 player4,1,1,finals"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-muted text-foreground rounded-sm text-sm hover:bg-accent hover:text-accent-foreground"
              disabled={importing}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={importing}
              className={`px-3 py-1.5 rounded-sm text-sm text-white ${
                importing ? 'bg-muted-foreground/60 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {importing ? 'Importing...' : 'Import'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
