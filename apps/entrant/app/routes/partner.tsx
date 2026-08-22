/**
 * `GET /e/partner` — the doubles invitation, and its two outcomes (E3).
 *
 * **This page is the argument for invites over capability links, rendered.**
 * A stranger arrives holding a URL somebody mailed them. What the URL buys
 * them is this page: who invited them, to what tournament, in what event.
 * What it does not buy them is the ability to act — the form below posts to
 * a route that requires a signed-in, verified entrant account, so the link
 * carries an invitation and never an authority.
 *
 * The preview is fetched server-side and anonymously (`apiFetch.server`
 * sends a frozen `accept`-only allowlist, so node relays no credential —
 * R8-D). That works precisely because the preview route is public by
 * design, and it is public because a person who has just been mailed a link
 * has no account yet.
 *
 * A dead invite — unknown, expired, already accepted, or attached to an
 * entry the nominator withdrew — is one uniform 404 from the API and one
 * message here. The page does not distinguish them because the API cannot:
 * a reader who could tell "expired" from "never existed" could confirm that
 * a forwarded link had once been real.
 */
import { Button, Notice, TextField } from '@scheduler/design-system/components';
import { data } from 'react-router';

import { MessagePage } from '../components/MessagePage';
import { PlayShell } from '../components/PlayShell';
import { FORM_FIELD } from '../lib/formField';
import { mintFormCsrf } from '../lib/formCsrf.server';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import type { Route } from './+types/partner';

const ACCEPTED_SUFFIX = '/accepted';
const FAILED_SUFFIX = '/failed';

/** See `verify.tsx` — same clamp, same reason. */
const MAX_TOKEN = 200;

interface PartnerInvite {
  tournamentName: string | null;
  slug: string | null;
  eventCode: string;
  discipline: string;
  invitedBy: string;
}

export interface PartnerLoaderData {
  formCsrf: string;
  token: string;
  invite: PartnerInvite | null;
  accepted: boolean;
  failed: boolean;
}

export async function loader({ request }: { request: Request }) {
  const csrf = mintFormCsrf();
  const url = new URL(request.url);
  const raw = url.searchParams.get('token') ?? '';
  const token = raw.length > MAX_TOKEN ? '' : raw;
  const accepted = url.pathname.endsWith(ACCEPTED_SUFFIX);
  const failed = url.pathname.endsWith(FAILED_SUFFIX);

  let invite: PartnerInvite | null = null;
  if (token && !accepted && !failed) {
    try {
      invite = await apiGet<PartnerInvite>(
        `/e/api/partner-invites/${encodeURIComponent(token)}`,
      );
    } catch (error) {
      // A 404 is the EXPECTED shape for every dead invite — unknown,
      // expired, already accepted, attached to a withdrawn entry — so it is
      // the answer rather than a failure, and the component renders it as
      // one message. A non-ApiError is rethrown: an unreachable backend is a
      // real fault and must not be dressed up as "your invitation expired".
      if (!(error instanceof ApiError)) throw error;
      invite = null;
    }
  }

  const payload: PartnerLoaderData = {
    formCsrf: csrf.token,
    token,
    invite,
    accepted,
    failed,
  };
  return data(payload, csrf.responseInit);
}

export function headers({ loaderHeaders }: { loaderHeaders: Headers }) {
  return loaderHeaders;
}

export const meta: Route.MetaFunction = () => [
  { title: 'A doubles invitation · ShuttleWorks Tournaments' },
];

const CARD = 'grid gap-4 rounded-lg border border-rule-soft bg-surface-raised p-6 shadow-sm';

export default function PartnerInvitePage({ loaderData }: Route.ComponentProps) {
  const { formCsrf, token, invite, accepted, failed } = loaderData;

  if (accepted) {
    return (
      <PlayShell>
        <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-10 md:py-14">
          <div className={CARD}>
            <Notice tone="success">
              You are entered as their partner. The organizer confirms entries,
              so this is not final until they do.
            </Notice>
            <Button asChild className="justify-self-start">
              <a href="/e/me/entries">See my entries</a>
            </Button>
          </div>
        </main>
      </PlayShell>
    );
  }

  if (failed) {
    return (
      <PlayShell>
        <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-10 md:py-14">
          <div className={CARD}>
            <Notice tone="warning">
              That did not go through. Either the invitation is no longer
              usable, or your email address is not confirmed yet. Sign in to
              check.
            </Notice>
            <Button asChild variant="outline" className="justify-self-start">
              <a href="/e/login">Sign in</a>
            </Button>
          </div>
        </main>
      </PlayShell>
    );
  }

  if (!invite) {
    // One message for every dead invite — see the module note.
    return (
      <MessagePage
        heading="That invitation is no longer available"
        body="Invitations expire, and each one can be accepted once. Ask whoever invited you to send a new one."
      />
    );
  }

  return (
    <PlayShell>
      <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-10 md:py-14">
        <header className="grid gap-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {invite.invitedBy} invited you to play
          </h1>
          <p className="text-sm text-muted-foreground">
            {invite.discipline} at {invite.tournamentName ?? 'a tournament'}.
            Nothing is entered in your name until you accept.
          </p>
        </header>

        <div className={CARD}>
          {/* Posts across the tier boundary to FastAPI (R8-A), as a native
              form: this tier ships no client JS. The route requires a
              signed-in verified account and answers 303 to an outcome page,
              which is what makes the invitation an invitation rather than a
              capability. */}
          <form
            method="post"
            action={`/e/api/partner-invites/${encodeURIComponent(token)}/accept`}
            className="grid gap-4"
          >
            <input type="hidden" name={FORM_FIELD} value={formCsrf} />

            {/* The accepting person describes themselves. The nominator knew
                their address; they did not necessarily know how they spell
                their name, and R12 needs a gender they cannot guess. */}
            <TextField
              id="partner-name"
              label="Your full name"
              name="fullName"
              required
              maxLength={200}
              autoComplete="name"
            />

            <div className="grid gap-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="partner-gender"
              >
                Gender
              </label>
              {/* A select, not free text: the value drives event
                  eligibility, and the soft filtering the form does upstream
                  reads these exact two codes. */}
              <select
                id="partner-gender"
                name="gender"
                required
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground"
                defaultValue=""
              >
                <option value="" disabled>
                  Select
                </option>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Used to check which events you can enter. Never published.
              </p>
            </div>

            <TextField
              id="partner-club"
              label="Club (optional)"
              name="club"
              maxLength={200}
            />

            <Button type="submit" className="justify-self-start">
              Accept and enter
            </Button>
          </form>

          <p className="border-t border-rule-soft pt-4 text-sm text-muted-foreground">
            You need a confirmed entrant account to accept.{' '}
            <a className="text-accent underline underline-offset-4" href="/e/login">
              Sign in
            </a>{' '}
            or{' '}
            <a className="text-accent underline underline-offset-4" href="/e/signup">
              create one
            </a>{' '}
            first. This page will still be here.
          </p>
        </div>
      </main>
    </PlayShell>
  );
}
