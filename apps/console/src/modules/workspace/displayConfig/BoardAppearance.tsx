/**
 * Board appearance — the venue board's own settings: **board title, logo,
 * banner, accent**, plus the two switches that change what the board carries
 * (**Show next**, **Show scores**).
 *
 * These live on `tournaments.board_settings` (one JSON column behind
 * `GET/PUT /tournaments/{id}/board-settings`), NOT on `TournamentConfig`,
 * for two reasons that both matter here:
 *
 *  - the BRACKET board never reads the meet config, and "Show next" has to
 *    mean the same thing on a meet, bracket and hybrid board — so these
 *    controls are offered for every board, not only Meet-enabled workspaces;
 *  - a logo is a data URI measured in kilobytes and the console PUTs the
 *    whole state blob back on every save, so branding in the blob would send
 *    the image over the wire on every write.
 *
 * **Images are stored inline, downscaled, as `data:` URIs.** That is what
 * makes a logo work in a gym with no internet, and it is the only image
 * source the app's own CSP admits besides same-origin (`img-src 'self'
 * data: blob:`) — a hosted URL from a third party is blocked by the board's
 * own policy, silently, which is exactly the failure this avoids. The
 * downscale is a canvas re-encode bounded by {@link MAX_IMAGE_EDGE} and
 * {@link MAX_IMAGE_CHARS}; the API enforces its own ceiling independently.
 *
 * Writes are explicit (`Save`), not debounced-through-the-store like
 * `DisplayLayoutEditor`: this surface has its own endpoint rather than
 * riding the tournament-state PUT, and an accidental half-typed hex should
 * not reach the wall.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@scheduler/design-system';
import { apiClient } from '../../../api/client';
import type { BoardSettingsDTO } from '../../../api/dto';
import { FieldRow, Row, Section, Toggle } from '../../../platform/engine-config/SettingsControls';

/** Longest edge, in CSS pixels, an uploaded board image is re-encoded to. */
const MAX_IMAGE_EDGE = 640;
/** Ceiling on the encoded data URI. The API's own limit is higher; this one
 *  keeps a board settings document small enough to ship with every summary
 *  read the boards make. */
const MAX_IMAGE_CHARS = 200_000;

const DEFAULTS: BoardSettingsDTO = {
  title: null,
  logoUrl: null,
  bannerUrl: null,
  accent: null,
  showNext: false,
  showScores: true,
};

/**
 * Read a picked file, downscale it to at most {@link MAX_IMAGE_EDGE} on its
 * longest edge, and return a PNG `data:` URI. Rejects when the result is
 * still over {@link MAX_IMAGE_CHARS} so the operator gets a real message
 * instead of a 422 from the API.
 */
export async function fileToBoardImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('That file is not an image the board can show.'));
    img.onload = () => resolve(img);
    img.src = dataUrl;
  });
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width || 1, image.height || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((image.width || 1) * scale));
  canvas.height = Math.max(1, Math.round((image.height || 1) * scale));
  const ctx = canvas.getContext('2d');
  // No 2D context (an old browser, a blocked canvas): keep the original
  // rather than failing the upload, and let the size check below judge it.
  const encoded = ctx
    ? (ctx.drawImage(image, 0, 0, canvas.width, canvas.height), canvas.toDataURL('image/png'))
    : dataUrl;
  if (encoded.length > MAX_IMAGE_CHARS) {
    throw new Error('That image is too large for the board. Try a smaller one.');
  }
  return encoded;
}

function ImageField({
  label,
  value,
  onChange,
  onError,
  contain,
}: {
  label: string;
  value: string | null;
  onChange: (next: string | null) => void;
  onError: (message: string) => void;
  contain: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="border-b border-border/60 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            aria-label={label}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Clear the input so re-picking the same file fires again.
              event.target.value = '';
              if (!file) return;
              void fileToBoardImage(file)
                .then(onChange)
                .catch((error: Error) => onError(error.message));
            }}
          />
          <Button size="xs" variant="outline" onClick={() => inputRef.current?.click()}>
            {value ? 'Replace' : 'Upload'}
          </Button>
          {value ? (
            <Button size="xs" variant="ghost" onClick={() => onChange(null)}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      {value ? (
        <img
          src={value}
          alt={`${label} preview`}
          className={`mt-2 h-16 ${contain ? 'w-auto max-w-full object-contain' : 'w-full object-cover'} rounded-sm border border-border`}
        />
      ) : null}
    </div>
  );
}

export function BoardAppearance({ tid }: { tid: string }) {
  const [draft, setDraft] = useState<BoardSettingsDTO | null>(null);
  const [saved, setSaved] = useState<BoardSettingsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDraft(null);
    setSaved(null);
    setError(null);
    apiClient
      .getBoardSettings(tid)
      .then((b) => {
        if (cancelled) return;
        setDraft({ ...DEFAULTS, ...b });
        setSaved({ ...DEFAULTS, ...b });
      })
      .catch(() => {
        if (!cancelled) setError('The board settings could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [tid]);

  const update = useCallback(
    (patch: Partial<BoardSettingsDTO>) =>
      setDraft((current) => (current ? { ...current, ...patch } : current)),
    [],
  );

  if (!draft) {
    return (
      <Section title="Appearance">
        <p className="py-3 text-sm text-muted-foreground">
          {error ?? 'Loading the board settings…'}
        </p>
      </Section>
    );
  }

  const accent = draft.accent ?? '';
  const accentValid = accent === '' || /^#[0-9a-fA-F]{6}$/.test(accent);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = async () => {
    if (!accentValid) return;
    setBusy(true);
    setError(null);
    try {
      const next = await apiClient.updateBoardSettings(tid, {
        ...draft,
        title: draft.title?.trim() || null,
        accent: accent || null,
      });
      setDraft({ ...DEFAULTS, ...next });
      setSaved({ ...DEFAULTS, ...next });
    } catch {
      setError('The board settings could not be saved. Retry when connected.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    {/* What the board CARRIES, above what it looks like — the two questions
        an operator opens this page with. */}
    <Section title="Board content">
      <Row
        // Default OFF, on every board (match-card contract §4.4). The board's
        // job is the match on the court now; a preview is opt-in.
        label="Show next"
        control={
          <Toggle
            value={draft.showNext}
            onChange={(showNext) => update({ showNext })}
            ariaLabel="Show next"
          />
        }
      />
      <Row
        label="Show scores"
        last
        control={
          <Toggle
            value={draft.showScores}
            onChange={(showScores) => update({ showScores })}
            ariaLabel="Show scores"
          />
        }
      />
    </Section>
    <Section title="Appearance">
      <FieldRow
        label="Board title"
        value={draft.title ?? ''}
        placeholder="The tournament's name"
        onChange={(e) => update({ title: e.target.value })}
      />
      <ImageField
        label="Logo"
        value={draft.logoUrl}
        contain
        onChange={(logoUrl) => update({ logoUrl })}
        onError={setError}
      />
      <ImageField
        label="Banner"
        value={draft.bannerUrl}
        contain={false}
        onChange={(bannerUrl) => update({ bannerUrl })}
        onError={setError}
      />
      <Row
        label="Accent"
        last
        control={
          <span className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Accent colour"
              value={accentValid && accent ? accent : '#10b981'}
              onChange={(e) => update({ accent: e.target.value })}
              className="h-7 w-10 cursor-pointer rounded border border-border-control bg-card"
            />
            {draft.accent ? (
              <Button size="xs" variant="ghost" onClick={() => update({ accent: null })}>
                Reset
              </Button>
            ) : null}
          </span>
        }
      />
      <div className="flex items-center gap-3 pt-3">
        <Button size="sm" onClick={() => void save()} disabled={busy || !dirty || !accentValid}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : !dirty && saved ? (
          <p className="text-xs text-muted-foreground">Saved.</p>
        ) : null}
      </div>
    </Section>
    </>
  );
}
