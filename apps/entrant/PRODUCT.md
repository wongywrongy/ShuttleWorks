# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: an individual player entering themselves.** One person finds a tournament, checks that
entries are open, enters themselves (and, where the format allows, a partner), and wants to know what
it costs, when it closes, and what happens next. Confirmed 2026-08-11.

**Second audience, viewing not entering: anyone following the event.** Players, their families,
clubs, and spectators who want to see the draws, the matches, and the results — the same way they
would follow any sporting event. This audience never signs in and never submits anything.

The entry form does support a multi-player submission (up to 12 players, which the throttle budgets
assume arrive as club-ordered batches), and junior events dominate real data — but neither a club
secretary nor a parent has been confirmed as a primary user. Design for the individual player; do not
let the bulk affordance intrude on that path.

## Product Purpose

The public face of a tournament. It is where a tournament exists on the internet: its entry page, its
fee schedule, its deadlines, and — as the product completes — its draws, matches and results.

Success is an entrant who finds the tournament, understands whether they can enter it, and enters it
without help; and a follower who can see what is happening at an event they care about without an
account.

## Positioning

**The public tournament site, in the shape people already expect** — the role Tournament Software
plays for badminton: a public place to see draws, matches and results, and for athletes to enter.
That familiarity is deliberate and is the position to protect: this is not a novel interaction model,
it is the expected one, done well.

The mechanism a neighbouring product cannot trivially copy is what sits behind it: an entry here is
not a form submission a director re-keys. It becomes a roster row and then a bracket participant
through the commit seam, and the same system that took the entry runs the draw and publishes the
result. Intake, engine and emit are one product.

## Operating Context

- Read on phones as often as desktops, frequently on venue wifi in sports halls.
- Entry is a one-off act for most users: they may enter a handful of tournaments a year and will not
  learn an interface.
- The audience arrives by link — a poster, a club message, a federation page — as often as by
  browsing, so any page must stand alone.
- Entrant identity is **separate** from operator identity: different accounts, different cookies. An
  operator signed into the console is not signed in here, and must not be.
- Fees are set per tournament by its organiser; the site displays and totals them, it does not take
  payment. Payment instructions are the organiser's own text.

## Capabilities and Constraints

**Built today:** discovery with status/date/text filters · a tournament page (Overview, Events,
Entrants) · a dedicated entry flow with a server-computed running total · entrant accounts
(sign-up/sign-in) · receipts · sitemap and robots.

**Intended but NOT built:** public **draws, matches and results**. SP-P6-2 excluded them deliberately
— the tab bar ships as Overview | Events | Entrants and is built so new tabs are data additions,
pending the migration of Display's projections under the public site. The positioning above depends
on this arriving; it is the largest open gap between what the product claims and what it does.

**Deferred to E2:** any signed-in surface — "my tournaments", a profile, withdraw. The tier
structurally cannot know who is reading (see below), and the my-entries API does not exist.

**Hard constraints that future work must design within, not around:**

- **Zero client JavaScript. This is a durable product commitment, confirmed 2026-08-11** — not an
  implementation detail. Every page is server-rendered with native HTML forms; a 4 KB page-weight
  gate blocks CI, and the CSP is `script-src 'self'`. Interactions are solved natively (GET forms,
  `?tab=` links, `<details>`, CSS `position: sticky`) or they are reported, not scripted around.
- **The rendering tier never relays credentials.** It cannot read a cookie or an inbound header, so
  it cannot know who is reading a page. Outcomes are carried on the URL, not derived from identity.
- **A closed or unknown entry page answers a byte-identical 404.** Whether a tournament exists is not
  disclosed before its organiser opens entries.
- Entry pages are public only when their organiser opens them; the same flag governs listing.
- No currency is recorded anywhere in the data. Fees render as bare amounts, and the renderer
  deliberately refuses to invent a symbol. An open proposal (G7) would add one nullable ISO-4217
  field; until it is ruled on, do not display a currency.

**Terminology:** a *workspace* is a tournament; an *entry page* is its public face; an *entrant* is a
person who enters; an *event* is a category within a tournament; a *draw* is a bracket.

## Brand Commitments

`packages/design-system` is the binding source of tokens, type scale and spacing scale, shared with
the operator console. The public site uses the same tokens in a **consumer register** — welcoming and
scannable — where the operator console is dense and technical. Diverging into a second visual system
is not available.

## Evidence on Hand

- A live, seeded local deployment: eight tournaments, ~390 people, 788 matches, six draw formats.
- Screenshots of every public page at 390px and 1280px in `docs/screenshots/sp-p6-2/`.
- **The seed data uses real organisation names** (USA Badminton, Bellevue Badminton Club, and
  others). It is local demo data only. It must never be published, deployed, or presented as
  endorsement, and no claim of use, partnership or adoption by any of them may be made.
- No testimonials, customers, benchmarks, pricing, or adoption figures exist. Do not fabricate them.

## Product Principles

1. **The page answers "can I enter this right now" before it is scrolled.** That is the entrant's
   only question on arrival, and every other element is subordinate to it.
2. **Never assert what the system does not know.** A failed read is not an empty result; an unknown
   viewer is not a signed-out one; a missing currency is not dollars. Hedge honestly rather than
   guess confidently.
3. **A one-off user learns nothing.** Most entrants use this a few times a year. Familiar structure
   beats clever structure.
4. **It has to work on the worst connection at the venue.** The zero-JS floor is a user promise, not
   a technical preference.
5. **The organiser's tournament, not our platform.** Their fees, their instructions, their
   regulations, their name.

## Accessibility & Inclusion

- **R11 dual width is a standing requirement**: comfortable on desktop, fully functional at 390px.
  Every public page is verified at both.
- Zero JavaScript makes native semantics the only mechanism available, which is a floor rather than a
  ceiling — keyboard reachability, correct announcement and visible focus are in scope for every
  surface, and a control that only works with a pointer is a defect.
- Junior events mean minors' data (names, birth years) passes through this site. It must not reach a
  URL, a log, or any page that did not need it.
