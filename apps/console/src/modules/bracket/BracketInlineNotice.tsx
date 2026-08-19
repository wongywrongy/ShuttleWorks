type NoticeTone = 'info' | 'error' | 'warning';

interface BracketInlineNoticeProps {
  tone: NoticeTone;
  title: string;
  message?: string;
}

const TONE_CLASS: Record<NoticeTone, string> = {
  info: 'border-border bg-card text-card-foreground',
  warning: 'border-status-called/40 bg-status-called/10 text-foreground',
  error: 'border-destructive/40 bg-destructive/10 text-destructive',
};

export function BracketInlineNotice({
  tone,
  title,
  message,
}: BracketInlineNoticeProps) {
  const role = tone === 'error' ? 'alert' : undefined;
  return (
    <div
      role={role}
      className={`mx-4 mt-4 rounded-sm border px-3 py-2 text-sm ${TONE_CLASS[tone]}`}
    >
      <div className="font-medium">{title}</div>
      {message ? (
        <div className="mt-0.5 text-xs opacity-80">{message}</div>
      ) : null}
    </div>
  );
}
