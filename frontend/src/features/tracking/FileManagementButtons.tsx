/**
 * File Management Buttons Component
 * Provides export, import, and reset functionality for tournament state
 */
import { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface FileManagementButtonsProps {
  onExport: () => Promise<void>;
  onImport: (file: File) => Promise<{ message: string; matchCount: number }>;
  onReset: () => Promise<void>;
  onSync: () => Promise<void>;
}

export function FileManagementButtons({
  onExport,
  onImport,
  onReset,
  onSync
}: FileManagementButtonsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      await onExport();
    } catch (error) {
      alert('Failed to export tournament state. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const result = await onImport(file);
      alert(`Successfully imported ${result.matchCount} match states!`);
    } catch (error) {
      alert('Failed to import tournament state. Please check the file and try again.');
    } finally {
      setLoading(false);
      // Reset input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleReset = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to reset all match states? This will clear all progress and cannot be undone.\n\nConsider exporting first to create a backup.'
    );

    if (!confirmed) return;

    setLoading(true);
    try {
      await onReset();
      alert('All match states have been reset.');
    } catch (error) {
      alert('Failed to reset match states. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await onSync();
    } catch (error) {
      alert('Failed to sync match states. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900">File Management</h3>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          title="Refresh match states from server"
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`}
          />
          {syncing ? 'Syncing…' : 'Refresh'}
        </button>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Export your tournament state to move it between computers, or import a previously saved state.
      </p>

      <div className="flex flex-wrap gap-2">
        {/* Export Button */}
        <button
          onClick={handleExport}
          disabled={loading}
          className="flex-1 min-w-[120px] px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 text-sm font-medium"
        >
          {loading ? 'Exporting...' : 'Export'}
        </button>

        {/* Import Button */}
        <button
          onClick={handleImportClick}
          disabled={loading}
          className="flex-1 min-w-[120px] px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 text-sm font-medium"
        >
          {loading ? 'Importing...' : 'Import'}
        </button>

        {/* Reset Button */}
        <button
          onClick={handleReset}
          disabled={loading}
          className="flex-1 min-w-[120px] px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 text-sm font-medium"
        >
          Reset All
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileSelected}
        className="hidden"
      />

      {/* Help Text */}
      <div className="mt-4 p-3 bg-blue-50 rounded-md text-xs text-gray-700">
        <p className="font-medium text-blue-900 mb-1">Portable State File</p>
        <p>
          The tournament state is saved in <code className="bg-white px-1 py-0.5 rounded">tournament_state.json</code>.
          You can copy this file to a USB drive, email it, or store it in the cloud to move your tournament progress between computers.
        </p>
      </div>
    </div>
  );
}
