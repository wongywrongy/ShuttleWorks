import { useState, type FormEvent } from 'react';
import type { RosterImportDTO } from '../../api/dto';

interface RosterImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: RosterImportDTO) => Promise<void>;
}

export function RosterImportDialog({ isOpen, onClose, onImport }: RosterImportDialogProps) {
  const [csvContent, setCsvContent] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFormatGuide, setShowFormatGuide] = useState(false);

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
      setError(err instanceof Error ? err.message : 'Failed to import roster');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-card rounded shadow p-4 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-semibold">Import Roster from CSV</h3>
          <button
            type="button"
            onClick={() => setShowFormatGuide(!showFormatGuide)}
            className="text-sm px-2 py-1 bg-blue-100 text-blue-700 rounded-sm hover:bg-blue-200"
          >
            {showFormatGuide ? 'Hide' : 'Show'} Format Guide
          </button>
        </div>

        {showFormatGuide && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-sm text-sm">
            <h4 className="font-semibold text-blue-900 mb-2">CSV Format Guide</h4>
            <div className="space-y-2 text-blue-800">
            <p><strong>Two Formats Supported:</strong></p>
            
            <p className="mt-2 font-semibold">1. Flat Format:</p>
            <code className="block bg-card p-2 rounded font-mono text-xs">
              id,name,minRestMinutes,notes,availability
            </code>
            
            <p className="mt-2 font-semibold">2. Hierarchical Format:</p>
            <code className="block bg-card p-2 rounded font-mono text-xs">
              groupPath,id,name,minRestMinutes,notes,availability
            </code>
            <p className="ml-2 text-xs">groupPath format: <code className="bg-card px-1 rounded">parent:child</code> or <code className="bg-card px-1 rounded">division:team</code></p>
            
            <p className="mt-3"><strong>Fields:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
              <li><strong>groupPath</strong> (hierarchical only): Group hierarchy path like "Men's Division:Team Alpha"</li>
              <li><strong>id</strong> (required): Unique player identifier</li>
              <li><strong>name</strong> (required): Player's full name</li>
              <li><strong>minRestMinutes</strong> (optional, default: 30): Minimum rest time</li>
              <li><strong>notes</strong> (optional): Additional notes</li>
              <li><strong>availability</strong> (optional): Time windows (HH:mm-HH:mm;HH:mm-HH:mm)</li>
            </ul>

            <p className="mt-3"><strong>Examples:</strong></p>
            <div className="bg-card p-2 rounded font-mono text-xs space-y-1">
              <div className="text-muted-foreground"># Flat format:</div>
              <div>player1,John Doe,30,Team captain,09:00-12:00;14:00-18:00</div>
              <div className="text-muted-foreground mt-2"># Hierarchical format:</div>
              <div>Men's Division:Team Alpha,player1,John Doe,30</div>
              <div>Men's Division:Team Beta,player2,Jane Smith,45</div>
              <div>Women's Division:Team Gamma,player3,Bob Johnson,30</div>
            </div>

              <p className="mt-3 text-xs text-blue-700">
                <strong>Note:</strong> After importing, you can edit individual players to add/modify availability windows and other details.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-3 p-2 bg-red-100 border border-red-400 text-red-700 rounded-sm text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="block text-sm font-medium text-foreground mb-1">
              CSV Content
            </label>
            <textarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              className="w-full px-2 py-1.5 border border-border rounded-sm font-mono text-sm"
              rows={10}
              placeholder="player1,John Doe,30,Team captain,09:00-12:00;14:00-18:00&#10;player2,Jane Smith,45,Injured knee,10:00-16:00&#10;player3,Bob Johnson,30,,&#10;player4,Alice Brown,60,Senior player"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Format: id,name,minRestMinutes,notes,availability
            </p>
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
