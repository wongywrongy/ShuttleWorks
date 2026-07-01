/**
 * Display Configuration — the workspace's public-display settings: which engines
 * feed the display (follows the enabled modules) and the shareable public URL.
 * The live preview itself is the Display · Preview surface.
 */
import { useState } from 'react';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { Button } from '@scheduler/design-system';
import type { WorkspaceModule } from '../../platform/product-shell/types';

export function DisplayConfig({ tid, modules }: { tid: string; modules: WorkspaceModule[] }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicUrl = `${origin}/display?id=${tid}`;
  const isOn = (id: string) => modules.some((m) => m.id === id && m.status === 'enabled');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Display</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          What the public display shows, and where to open it.
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Feeds</h3>
        <div className="divide-y divide-border rounded-md border border-border">
          {[
            { id: 'meet', label: 'Meet', desc: 'Live courts, scores, and standings.' },
            { id: 'bracket', label: 'Bracket', desc: 'Draw progress and results.' },
          ].map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-4 p-3">
              <div>
                <div className="text-sm font-medium text-foreground">{f.label}</div>
                <div className="text-xs text-muted-foreground">{f.desc}</div>
              </div>
              <span
                className={[
                  'rounded-sm px-1.5 py-0.5 text-2xs font-medium',
                  isOn(f.id) ? 'bg-accent/10 text-accent' : 'border border-border text-muted-foreground',
                ].join(' ')}
              >
                {isOn(f.id) ? 'On' : 'Off'}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Feeds follow the workspace&rsquo;s enabled modules. Enable or disable a module from
          Workspace&nbsp;&rsaquo;&nbsp;Modules.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Public link</h3>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={publicUrl}
            aria-label="Public display URL"
            className="min-w-0 flex-1 rounded border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground"
          />
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-bg-elev px-3 py-2 text-sm text-foreground hover:bg-muted/40"
          >
            <ArrowSquareOut aria-hidden className="h-4 w-4" />
            Open
          </a>
        </div>
        <p className="text-xs text-muted-foreground">View-only. Anyone with the link can watch — no sign-in required.</p>
      </section>
    </div>
  );
}
