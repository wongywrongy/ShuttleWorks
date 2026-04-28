import { useEffect, useState } from 'react';

import { getCurrentSlot } from '../lib/time';
import { useAppStore } from '../store/appStore';

/**
 * Wall-clock slot index for the current tournament config, refreshed
 * once a minute. Multiple pages used to inline the same
 * ``useEffect`` + ``setInterval(60_000)`` pattern; this hook is the
 * canonical source.
 *
 * Returns 0 when no config is loaded.
 */
export function useCurrentSlot(): number {
  const config = useAppStore((s) => s.config);
  const [slot, setSlot] = useState(() => (config ? getCurrentSlot(config) : 0));

  useEffect(() => {
    if (!config) {
      setSlot(0);
      return;
    }
    setSlot(getCurrentSlot(config));
    const id = window.setInterval(() => setSlot(getCurrentSlot(config)), 60_000);
    return () => window.clearInterval(id);
  }, [config]);

  return slot;
}
