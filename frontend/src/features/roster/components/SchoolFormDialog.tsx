import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import type { RosterGroupDTO } from '../../../api/dto';

const COLOR_PRESETS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280',
];

interface SchoolFormDialogProps {
  isOpen: boolean;
  school?: RosterGroupDTO;
  onClose: () => void;
  onSave: (school: { name: string; color: string }) => void;
  onDelete?: () => void;
}

/**
 * SchoolFormDialog Component
 *
 * Modal for creating or editing a school.
 */
export function SchoolFormDialog({
  isOpen,
  school,
  onClose,
  onSave,
  onDelete,
}: SchoolFormDialogProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3B82F6');

  useEffect(() => {
    if (school) {
      setName(school.name);
      setColor(school.metadata?.color || '#3B82F6');
    } else {
      setName('');
      setColor('#3B82F6');
    }
  }, [school, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), color });
    onClose();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-sm transform overflow-hidden rounded bg-white p-4 shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-sm font-medium text-foreground mb-4">
                  {school ? 'Edit School' : 'Add School'}
                </Dialog.Title>

                <form onSubmit={handleSubmit}>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        School Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter school name"
                        className="w-full px-3 py-2 border border-border rounded text-sm focus:outline-none focus:border-muted-foreground/40"
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-foreground mb-2">
                        Color
                      </label>
                      <div className="flex items-center gap-1.5">
                        {COLOR_PRESETS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setColor(c)}
                            className={`w-6 h-6 rounded-full border-2 transition-all ${
                              color === c ? 'border-foreground scale-110' : 'border-transparent hover:border-border'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-between">
                    {school && onDelete ? (
                      <button
                        type="button"
                        onClick={() => {
                          onDelete();
                          onClose();
                        }}
                        className="text-sm text-red-600 hover:text-red-700"
                      >
                        Delete
                      </button>
                    ) : (
                      <div />
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!name.trim()}
                        className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {school ? 'Save' : 'Add'}
                      </button>
                    </div>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
