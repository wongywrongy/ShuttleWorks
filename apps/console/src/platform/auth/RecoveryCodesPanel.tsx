import { useState } from 'react';
import { Button, Card, Notice } from '@scheduler/design-system';

interface Props {
  codes: string[];
  onAcknowledge: () => Promise<void>;
  title?: string;
}

/** Issue-once recovery codes. They live only in this mounted panel: never in
 *  storage, and gone once acknowledged. Copy puts them on the clipboard as one
 *  code per line so a password manager note can take them whole. */
export function RecoveryCodesPanel({ codes, onAcknowledge, title = 'Save your recovery codes' }: Props) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      setError('Copying is blocked in this browser. Select the codes and copy them by hand.');
    }
  };

  return <Card className="w-full max-w-md space-y-4 p-8">
    <h1 className="text-xl font-semibold">{title}</h1>
    <p className="text-sm text-muted-foreground">Each code works once, together with your password. Save them somewhere private before continuing. They are shown only now.</p>
    <ul aria-label="Recovery codes" className="select-all space-y-1 font-mono text-sm">
      {codes.map((value) => <li key={value}>{value}</li>)}
    </ul>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy codes'}</Button>
      <Button disabled={busy} onClick={() => {
        setBusy(true);
        setError(null);
        void onAcknowledge().catch(() => {
          setError('Could not continue. Your codes are still here; try again.');
          setBusy(false);
        });
      }}>I have saved my codes</Button>
    </div>
    {error && <Notice tone="danger" role="alert">{error}</Notice>}
  </Card>;
}
