/**
 * `GET /e/partner/:token` — the doubles invitation, and its two outcomes (E3).
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
import { brandedTitle } from '@scheduler/brand';
import { data } from 'react-router';

import { MessagePage } from '../components/MessagePage';
import { PersonRef } from '../components/PersonRef';
import { PlayShell } from '../components/PlayShell';
import { FORM_FIELD } from '../lib/formField';
import { mintFormCsrf } from '../lib/formCsrf.server';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import { CARD, PAGE_TITLE } from '../lib/ui';
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
  askBirthYear: boolean;
}

export interface PartnerLoaderData {
  formCsrf: string;
  token: string;
  invite: PartnerInvite | null;
  accepted: boolean;
  failed: boolean;
  failureReason?: 'unverified' | 'unusable' | 'retry' | null;
  entryId?: string;
}

export async function loader({
  request,
  params,
}: {
  request: Request;
  params?: { token?: string };
}) {
  const csrf = mintFormCsrf();
  const url = new URL(request.url);
  const raw = params?.token ?? '';
  const token = raw.length > MAX_TOKEN ? '' : raw;
  const accepted = url.pathname.endsWith(ACCEPTED_SUFFIX);
  const failed = url.pathname.endsWith(FAILED_SUFFIX);
  const rawReason = url.searchParams.get('reason');
  const failureReason = rawReason === 'unverified' || rawReason === 'unusable' || rawReason === 'retry'
    ? rawReason
    : null;

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
    failureReason,
    entryId: accepted ? url.searchParams.get('entryId') ?? '' : '',
  };
  return data(payload, csrf.responseInit);
}

export function headers({ loaderHeaders }: { loaderHeaders: Headers }) {
  return loaderHeaders;
}

export const meta: Route.MetaFunction = () => [
  { title: brandedTitle('A doubles invitation') },
];

const FORM_CARD = `grid gap-4 ${CARD}`;

export default function PartnerInvitePage({ loaderData }: Route.ComponentProps) {
  const { formCsrf, token, invite, accepted, failed, failureReason } = loaderData;

  if (accepted) {
    return (
      <PlayShell>
        <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-10 md:py-14">
          <div className={FORM_CARD}>
            <h1 id="partner-accepted-title" className={PAGE_TITLE}>Partner invitation update</h1>
            <div id="partner-accepted-details" data-entry-id={loaderData.entryId ?? ''} aria-live="polite">
              <p className="text-sm text-muted-foreground">Checking your signed-in entries.</p>
            </div>
            <script type="module" src="/e/assets/partner-accepted.js" />
            <Button asChild size="lg" className="justify-self-start">
              <a href="/e/me/entries">See my entries</a>
            </Button>
          </div>
        </main>
      </PlayShell>
    );
  }

  if (failed) {
    // V3-PE37.1: the action must match the stated remedy. Only the
    // `unverified` case is actually resolved by an account step; `verify.tsx`
    // (package 23's file, out of this package's scope) does not accept a
    // `next=` destination, so the link honestly says only what it does —
    // confirming the address — rather than promising a return this route
    // cannot keep. `retry` names a real thing to retry — the invitation
    // itself. The default (`unusable`) case tells the reader to ask for a
    // new link; "Sign in" answered a different question, so it is replaced
    // by the same honest return action the dead-invite state above offers.
    const returnTo = `/e/partner/${encodeURIComponent(token)}`;
    return (
      <PlayShell>
        <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-10 md:py-14">
          <div className={FORM_CARD}>
            <h1 className={PAGE_TITLE}>Invitation unavailable</h1>
            <Notice tone="warning">
              {failureReason === 'unverified'
                ? 'Confirm your email address before accepting this invitation.'
                : failureReason === 'retry'
                  ? 'The tournament is temporarily unavailable for changes. Try again shortly.'
                  : 'This invitation is no longer usable. Ask the person who invited you to send a new one.'}
            </Notice>
            {failureReason === 'unverified' ? (
              <Button asChild variant="outline" className="justify-self-start">
                <a href="/e/verify">Verify your email</a>
              </Button>
            ) : failureReason === 'retry' ? (
              <Button asChild variant="outline" className="justify-self-start">
                <a href={returnTo}>Try again</a>
              </Button>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href="/e/">Browse tournaments</a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href="/e/me/entries">Check My entries</a>
                </Button>
              </div>
            )}
          </div>
        </main>
      </PlayShell>
    );
  }

  if (!invite) {
    // One message for every dead invite — see the module note. V3-PE35.1:
    // the API cannot distinguish "never existed" from "already accepted"
    // (deliberately — see the module docstring), so the copy claims neither
    // expiry nor acceptance; it states what IS true (this link answers
    // nothing) and offers both the honest next step and a safe way to check
    // an already-accepted invitation without claiming that is what happened.
    return (
      <MessagePage
        heading="Invitation unavailable"
        body="This invitation is unavailable. Ask your partner to send a new one."
        secondaryAction={{ href: '/e/me/entries', label: 'Check My entries' }}
      />
    );
  }

  const invitationPath = `/e/partner/${encodeURIComponent(token)}`;

  return (
    <PlayShell>
      <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-10 md:py-14">
        <header className="grid gap-1">
          <h1 className={PAGE_TITLE}>
            <PersonRef
              slug={invite.slug ?? ''}
              identity={{ id: null, name: invite.invitedBy }}
              state="dead"
            />{' '}
            invited you to play
          </h1>
          <p className="text-sm text-muted-foreground">
            {invite.discipline} at {invite.tournamentName ?? 'a tournament'}.
            Nothing is entered in your name until you accept.
          </p>
        </header>

        <div className={FORM_CARD}>
          {/* Posts across the tier boundary to FastAPI (R8-A), as a native
              form that does not depend on client JS. The route requires a
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
                className="h-10 rounded-md border border-border bg-bg-elev px-3 text-sm text-foreground"
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

            {invite.askBirthYear ? (
              <TextField
                id="partner-year"
                label="Birth year"
                name="birthYear"
                inputMode="numeric"
                maxLength={4}
                hint="This tournament runs age-bracketed events, so the organizer needs a year to place this player."
              />
            ) : null}

            <Button type="submit" size="lg" className="justify-self-start">
              Accept and enter
            </Button>
          </form>

          <p className="border-t border-rule-soft pt-4 text-sm text-muted-foreground">
            You need a confirmed entrant account to accept.{' '}
            <a
              className="text-accent underline underline-offset-4"
              href={`/e/login?next=${encodeURIComponent(invitationPath)}`}
            >
              Sign in
            </a>{' '}
            or{' '}
            <a
              className="text-accent underline underline-offset-4"
              href={`/e/signup?next=${encodeURIComponent(`/e/partner/${token}`)}`}
            >
              create one
            </a>{' '}
            first. You will return to this invitation.
          </p>
        </div>
      </main>
    </PlayShell>
  );
}
