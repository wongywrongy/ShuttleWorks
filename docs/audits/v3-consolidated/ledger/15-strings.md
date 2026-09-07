# Ledger — package 15 (publication and entrant privacy)

Columns per plan §4: string key/file:line · surface · state · current text · verdict · final text · factual prerequisite · finding IDs · evidence.

## Publication surfaces

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `PublicationSettings.tsx:23` draws row detail | Settings/Publish site → Publication audience and content | static | "Draw structure and seeds. Scores remain hidden unless results are published." | change | "Shows draw pairings and player names. Scores appear only when Results is on." | Confirmed by code read: `entries_site.py` `_person_ref`/`_public_identities` resolve confirmed, non-opted-out, non-erased names in the draw **independently of `entrants_published`** — only `results_published` gates the score/ledger. `entrantsPublished` only gates the discovery entrant-list route (`entries_site.py:1370-1373,1585-1592`). Verified with `test_publication_matrix.py::test_entrants_toggle_gates_the_directory_list_not_draw_names`. | V3-OC20.1 | `apps/api/src/entries/entries_site.py` lines cited; new backend test |
| `SetupProduct.tsx:426` "Public slug" | Setup → Public information | static | "Public slug" | change | "Tournament page address" (with hint: "This is the slug in your public page's address — the rest of the address does not change.") | Acceptance: "the address field explains what part of the public address changes" | V3-OC13.1 | `apps/console/src/modules/setup/SetupProduct.tsx` |
| `SetupProduct.tsx:427` Description field | Setup → Public information | static | Single-line `FieldRow` input | change | Multiline `<textarea rows={4}>` in the same form footprint (no design-system dependency added — a locally styled textarea matching `TextField`'s visual language) | Acceptance: "A full description is readable while editing" | V3-OC13.1 | same file |
| `SetupProduct.tsx:428-430` "Regulations URL" / "Logo URL" / "Banner URL" | Setup → Public information | static | "Regulations URL", "Logo URL", "Banner URL" | change | "Regulations link", "Logo image link", "Banner image link" | Acceptance: emphasize what the reader gets, not the storage format | V3-OC13.1 | same file |
| `SetupProduct.tsx:442` preview-failure message (both logo and banner boxes) | Setup → Public information → image preview | `img onError` fired | "Preview unavailable. Check the address before saving." (identical for both boxes, no retry) | change | "The image could not be loaded from this link." + an in-box "Retry preview" button that clears the error and remounts the `<img>` | Acceptance: "A failed preview can be retried without saving." The new copy reports only a load failure, never "invalid" — no URL-format validation exists in this component to justify that stronger claim (see debt below). | V3-OC13.2 | same file |

## Debt logged (not fixed here — see `docs/reference/debt-log.md`)

- **V3-OC13.2, partial:** the acceptance also asks that "field validation and image-fetch failure have distinct messages." This package only has one failure signal (the `<img onError>` event) and no URL-syntax validation on the Logo/Banner/Regulations fields, so a genuinely malformed URL and a reachable-but-broken image both currently render the same "could not be loaded" message. Adding field-level URL format validation is a bigger change than the copy/state fix in scope here; logged as debt rather than done partially.

## Verify-only (no change needed)

- **V3-OC12.1** (routed here for verification, fixed by package 05): confirmed no trace of "future public projection" / "public contact details" language remains anywhere in `apps/console/src/modules/settings/` or `apps/console/src/modules/setup/` (`grep` clean). No further action.
