import { useEffect, useState } from 'react';

/** Restarts private read loops after successful session recovery, without remounting forms. */
export function useSessionRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const restored = () => setRevision((value) => value + 1);
    window.addEventListener('sw:session-restored', restored);
    return () => window.removeEventListener('sw:session-restored', restored);
  }, []);
  return revision;
}
