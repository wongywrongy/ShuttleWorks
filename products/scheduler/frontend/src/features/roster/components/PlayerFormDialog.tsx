import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { PlayerForm } from '../PlayerForm';
import type { PlayerDTO } from '../../../api/dto';

interface PlayerFormDialogProps {
  isOpen: boolean;
  player?: PlayerDTO;
  onClose: () => void;
  onSave: (player: PlayerDTO) => void;
}

/**
 * PlayerFormDialog Component
 *
 * Modal wrapper for PlayerForm using Headless UI Dialog.
 * Opens as a centered modal overlay.
 */
export function PlayerFormDialog({
  isOpen,
  player,
  onClose,
  onSave,
}: PlayerFormDialogProps) {
  const handleSave = (savedPlayer: PlayerDTO) => {
    onSave(savedPlayer);
    onClose();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-modal" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm" />
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
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded bg-card shadow-xl transition-all">
                <PlayerForm
                  player={player}
                  onSave={handleSave}
                  onCancel={onClose}
                />
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
