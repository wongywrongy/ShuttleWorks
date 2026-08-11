"""The migration ledger for ``tests/test_entries_public_routes.py``.

SP-PROGRAM-1 Phase 6 retires the f-string HTML entry surface
(``api/entries_public.py``'s ``GET /e/{slug}`` and ``POST
/e/{slug}/submit``) and serves the same product from React Router 7 plus a
JSON API. **Submission behaviour is unchanged; only the serving context
moves.** So the ~90 tests that pinned that behaviour are *migrated*, not
deleted — CODE_HEALTH's rule that a superseded test becomes its successor
rather than a gap.

A rule like that lives in review until someone writes it down as a check.
This is the check. Each row names an old test and the test that takes over
its claim, in two dicts because the migration crosses a tier boundary:
``SUPERSEDED`` for the 74 claims a backend successor took, ``RENDER_TIER``
for the 18 that were claims about *markup* and therefore belong to
``products/scheduler/entrant/`` or to nobody.

Three assertions held the pair honest while the migration was in flight:

1. every row named a test that really existed in the old file — so a typo
   or a row invented for a test that was never there could not pad the
   ledger;
2. ``SUPERSEDED`` and ``RENDER_TIER`` together named **every** test in the
   old file, so a claim could not be dropped by leaving it out of both;
3. every successor named really exists in the file the row points at — so
   a migration cannot be declared done by editing a dict.

The first two derive from a file the cut-over deletes, so they were green
for the last time as that commit's pre-flight (92 = 74 + 18, no strays) and
are replaced by ``test_the_superseded_file_is_gone``. The third is the
ledger's whole remaining job and is unchanged.
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

_PRODUCT_ROOT = Path(__file__).resolve().parents[1]
_OLD = _PRODUCT_ROOT / "tests" / "test_entries_public_routes.py"

_PAGE = "tests/test_entries_page_api.py"
_SUBMIT = "tests/test_entries_submit_api.py"

_RENDER = "entrant/tests/entry.render.test.ts"
_QUOTE = "entrant/tests/entry.quote.test.ts"
_ECHO = "entrant/tests/echo.test.ts"
_INGRESS = "entrant/tests/ingress.test.ts"
_RECEIPT = "entrant/tests/receipt.test.ts"

# old test name -> (file that holds its successor, successor test name)
SUPERSEDED: dict[str, tuple[str, str]] = {
    # ---- the page projection: what the loader is allowed to publish ----
    "test_the_page_shows_the_tournament_its_date_and_its_events": (
        _PAGE, "test_the_projection_carries_the_tournament_its_date_and_its_events"),
    "test_the_page_shows_the_fee_and_the_regulations_with_their_version": (
        _PAGE, "test_the_projection_carries_the_fee_and_the_regulations_version"),
    "test_the_page_shows_the_fee_schedule_and_the_payment_instructions": (
        _PAGE, "test_the_projection_carries_the_schedule_and_the_payment_instructions"),
    "test_a_malformed_fee_tier_does_not_take_the_public_page_down": (
        _PAGE, "test_a_malformed_fee_tier_does_not_take_the_projection_down"),
    "test_the_card_shows_exactly_the_tiers_the_total_honours": (
        _PAGE, "test_the_projection_offers_exactly_the_tiers_the_quote_honours"),
    "test_a_clean_schedule_still_prints_every_tier": (
        _PAGE, "test_a_clean_schedule_still_projects_every_tier"),
    "test_the_page_shows_the_venue": (
        _PAGE, "test_the_projection_carries_the_venue"),
    "test_the_page_lists_entrant_names_and_events_only": (
        _PAGE, "test_the_projection_lists_entrant_names_only"),
    "test_an_opted_out_entrant_is_absent_but_a_listed_one_is_present": (
        _PAGE, "test_an_opted_out_entrant_is_absent_but_a_listed_one_is_present"),
    "test_withdrawn_and_rejected_entries_are_not_listed": (
        _PAGE, "test_withdrawn_and_rejected_entries_are_not_listed"),
    "test_the_list_never_reveals_entry_state": (
        _PAGE, "test_the_list_never_reveals_entry_state"),
    "test_every_interpolated_value_is_escaped": (
        _PAGE, "test_the_projection_carries_no_markup_at_all"),
    "test_an_unknown_slug_and_a_closed_page_answer_identically": (
        _PAGE, "test_an_unknown_slug_and_a_closed_page_answer_identically"),
    "test_an_open_page_is_the_negative_control_for_that_404": (
        _PAGE, "test_an_open_page_is_the_negative_control_for_that_404"),
    "test_a_signed_out_visitor_is_offered_the_login_path_not_a_404": (
        _PAGE, "test_a_signed_out_viewer_is_projected_as_signed_out_not_404"),
    "test_a_signed_in_entrant_sees_the_form": (
        _PAGE, "test_a_signed_in_viewer_carries_an_email_and_a_form_csrf_token"),
    "test_the_timeline_runs_open_close_withdraw_then_the_tournament": (
        _PAGE, "test_the_projection_carries_open_close_withdraw_and_the_date"),
    "test_a_deadline_that_differs_between_events_says_so_rather_than_picking_one": (
        _PAGE, "test_a_deadline_that_differs_between_events_is_projected_per_event"),
    "test_one_shared_deadline_is_stated_plainly": (
        _PAGE, "test_one_shared_deadline_is_projected_on_every_event"),
    "test_the_page_names_the_organisation_running_the_tournament": (
        _PAGE, "test_the_projection_names_the_organisation_running_the_tournament"),
    "test_a_workspace_with_no_org_renders_no_organiser_card": (
        _PAGE, "test_a_workspace_with_no_org_projects_no_organiser"),
    "test_the_birth_year_field_is_absent_when_no_event_is_age_bracketed": (
        _PAGE, "test_no_event_is_flagged_age_bracketed_when_none_is"),
    "test_the_birth_year_field_appears_for_an_age_bracketed_event": (
        _PAGE, "test_an_age_bracketed_event_is_flagged_in_the_projection"),
    "test_both_public_routes_are_registered": (
        _PAGE, "test_the_entrant_json_routes_are_registered"),
    "test_the_public_module_mints_no_capability_material_at_all": (
        _PAGE, "test_the_entrant_json_module_mints_no_capability_material_at_all"),
    # ---- the quote route: the round trip that replaces "Update events" --
    "test_the_refresh_round_trip_writes_nothing": (
        _SUBMIT, "test_the_quote_route_writes_nothing"),
    "test_the_running_total_is_shown_from_the_server_side_computation": (
        _SUBMIT, "test_the_quote_is_computed_server_side"),
    "test_the_total_shown_is_the_total_recorded": (
        _SUBMIT, "test_the_total_shown_is_the_total_recorded"),
    "test_the_total_covers_every_player_in_the_act": (
        _SUBMIT, "test_the_total_covers_every_player_in_the_act"),
    "test_nothing_selected_shows_no_total_rather_than_zero": (
        _SUBMIT, "test_nothing_selected_quotes_no_total_rather_than_zero"),
    # ---- the session gate (R10) ----------------------------------------
    "test_an_anonymous_submit_is_rejected": (
        _SUBMIT, "test_an_anonymous_submit_is_rejected"),
    "test_the_same_submission_from_a_signed_in_entrant_succeeds": (
        _SUBMIT, "test_the_same_submission_from_a_signed_in_entrant_succeeds"),
    "test_an_operator_session_does_not_authorize_a_submit": (
        _SUBMIT, "test_an_operator_session_does_not_authorize_a_submit"),
    "test_a_garbage_entrant_cookie_does_not_authorize_a_submit": (
        _SUBMIT, "test_a_garbage_entrant_cookie_does_not_authorize_a_submit"),
    # ---- CSRF channel two ----------------------------------------------
    "test_a_submit_without_the_form_csrf_token_is_refused": (
        _SUBMIT, "test_a_submit_without_the_form_csrf_token_is_refused"),
    "test_a_wrong_form_csrf_token_is_refused": (
        _SUBMIT, "test_a_wrong_form_csrf_token_is_refused"),
    "test_the_right_token_is_the_negative_control": (
        _SUBMIT, "test_the_right_token_is_the_negative_control"),
    "test_the_token_is_bound_to_the_session_that_rendered_the_form": (
        _SUBMIT, "test_the_token_is_bound_to_the_session_that_rendered_the_form"),
    # Not in the task brief's 47 rows, and a real gap without it: this is
    # the ONLY test of the route-owned ``require_form_csrf`` in
    # ``api/entries_json.py`` (every other CSRF row is answered by the
    # middleware before the route runs). Deleting the old file without a
    # successor would leave that guard's TypeError hazard unpinned.
    "test_a_non_ascii_form_token_is_a_refusal_and_not_a_500": (
        _SUBMIT, "test_a_non_ascii_form_token_is_a_refusal_and_not_a_500"),
    "test_submit_requires_no_challenge_token": (
        _SUBMIT, "test_submit_requires_no_challenge_token"),
    # ---- what one act records ------------------------------------------
    "test_a_valid_submission_lands_a_pending_entry_under_a_submission": (
        _SUBMIT, "test_a_valid_submission_lands_a_pending_entry_under_a_submission"),
    "test_the_player_carries_the_name_gender_and_remarks": (
        _SUBMIT, "test_the_player_carries_the_name_gender_and_remarks"),
    "test_the_acknowledgment_is_recorded_on_the_submission_with_its_version": (
        _SUBMIT,
        "test_the_acknowledgment_is_recorded_on_the_submission_with_its_version"),
    "test_the_fee_total_is_the_schedule_price_and_lives_on_the_submission": (
        _SUBMIT,
        "test_the_fee_total_is_the_schedule_price_and_lives_on_the_submission"),
    "test_two_events_for_one_player_are_one_act_at_the_tiered_price": (
        _SUBMIT, "test_two_events_for_one_player_are_one_act_at_the_tiered_price"),
    "test_two_players_in_one_act_share_one_acceptance_and_one_total": (
        _SUBMIT, "test_two_players_in_one_act_share_one_acceptance_and_one_total"),
    "test_an_empty_second_player_block_is_ignored_not_refused": (
        _SUBMIT, "test_an_empty_second_player_block_is_ignored_not_refused"),
    "test_the_entry_lands_under_the_tournament_the_slug_resolves_to": (
        _SUBMIT, "test_the_entry_lands_under_the_tournament_the_slug_resolves_to"),
    # ---- the acknowledgment --------------------------------------------
    "test_submission_without_the_acknowledgment_is_refused": (
        _SUBMIT, "test_submission_without_the_acknowledgment_is_refused"),
    "test_the_same_submission_with_the_box_ticked_succeeds": (
        _SUBMIT, "test_the_same_submission_with_the_box_ticked_succeeds"),
    # ---- the throttle ---------------------------------------------------
    "test_a_flood_from_one_ip_is_locked_out": (
        _SUBMIT, "test_a_flood_from_one_ip_is_locked_out"),
    "test_under_the_budget_nothing_is_locked": (
        _SUBMIT, "test_under_the_budget_nothing_is_locked"),
    "test_the_throttle_bucket_is_its_own_namespace": (
        _SUBMIT, "test_the_throttle_bucket_is_its_own_namespace"),
    # ---- idempotency ----------------------------------------------------
    "test_a_replayed_key_returns_the_original_act_and_creates_nothing": (
        _SUBMIT, "test_a_replayed_key_returns_the_original_act_and_creates_nothing"),
    "test_a_replay_answers_with_the_same_reference": (
        _SUBMIT, "test_a_replay_redirects_to_the_same_receipt"),
    "test_a_different_key_creates_a_second_act": (
        _SUBMIT, "test_a_different_key_creates_a_second_act"),
    "test_a_key_is_scoped_to_the_tournament_the_slug_resolves_to": (
        _SUBMIT, "test_a_key_is_scoped_to_the_tournament_the_slug_resolves_to"),
    # Also not in the brief's 47. Task 13 already closed the replay-scoping
    # defect and pinned it here, on the retired route; the successor is the
    # same claim posted at the JSON route, so the row points at it rather
    # than at a second copy of the test.
    "test_a_key_is_scoped_to_the_account_that_minted_it": (
        _SUBMIT,
        "test_a_foreign_idempotency_key_does_not_resolve_to_someone_elses_receipt"),
    # ---- the soft flags -------------------------------------------------
    "test_a_repeat_of_the_same_player_and_event_flags_the_new_entry": (
        _SUBMIT, "test_a_repeat_of_the_same_player_and_event_flags_the_new_entry"),
    "test_a_second_player_under_one_account_is_not_flagged": (
        _SUBMIT, "test_a_second_player_under_one_account_is_not_flagged"),
    "test_the_same_player_in_a_different_event_is_not_flagged": (
        _SUBMIT, "test_the_same_player_in_a_different_event_is_not_flagged"),
    "test_a_gender_mismatch_is_accepted_with_a_flag": (
        _SUBMIT, "test_a_gender_mismatch_is_accepted_with_a_flag"),
    "test_a_matching_gender_is_unflagged": (
        _SUBMIT, "test_a_matching_gender_is_unflagged"),
    # ---- entry policy ---------------------------------------------------
    "test_over_the_per_person_cap_is_refused_with_the_rule_stated": (
        _SUBMIT, "test_over_the_per_person_cap_is_refused_with_the_rule_stated"),
    "test_under_the_cap_is_accepted": (
        _SUBMIT, "test_under_the_cap_is_accepted"),
    # ---- the event, and cross-tenant probing ----------------------------
    "test_an_event_from_another_workspace_is_refused_and_leaks_nothing": (
        _SUBMIT, "test_an_event_from_another_workspace_is_refused_and_leaks_nothing"),
    "test_an_event_of_this_workspace_is_the_negative_control": (
        _SUBMIT, "test_an_event_of_this_workspace_is_the_negative_control"),
    "test_a_closed_event_is_refused": (
        _SUBMIT, "test_a_closed_event_is_refused"),
    "test_an_event_that_has_not_opened_yet_is_refused": (
        _SUBMIT, "test_an_event_that_has_not_opened_yet_is_refused"),
    "test_a_submission_to_an_unknown_slug_is_the_uniform_404": (
        _SUBMIT, "test_a_submission_to_an_unknown_slug_is_the_uniform_404"),
    "test_a_submission_with_no_events_selected_is_refused": (
        _SUBMIT, "test_a_submission_with_no_events_selected_is_refused"),
    "test_a_player_without_a_gender_is_refused": (
        _SUBMIT, "test_a_player_without_a_gender_is_refused"),
    "test_the_global_body_cap_applies_to_this_route_too": (
        _SUBMIT, "test_the_global_body_cap_applies_to_this_route_too"),
    "test_a_body_just_under_the_cap_is_accepted_through_the_same_route": (
        _SUBMIT, "test_a_body_just_under_the_cap_is_accepted_through_the_same_route"),
}


# The 18 rows that are NOT about backend behaviour. Each one asserted
# something about *markup* — a checkbox attribute, a stylesheet rule, a
# sentence on a page — which is the one thing this cut-over genuinely moves
# rather than merely relocates. A tuple is a checked successor in the RR7
# suite; a string is a **deliberate drop, with its reason**, because a claim
# that quietly has no home is the failure mode this whole file exists to
# make visible.
RENDER_TIER: dict[str, tuple[str, str] | str] = {
    # ---- the form's transport shape and its gates ----------------------
    "test_the_acknowledgment_checkbox_gates_submit_in_the_browser_too": (
        _RENDER, "requires the acknowledgment in the markup itself"),
    "test_the_form_offers_a_checkbox_per_open_event_carrying_the_player_index": (
        _RENDER, "prefixes every event checkbox with its player index"),
    "test_the_gender_field_is_required_and_the_club_field_is_not": (
        _RENDER, "leaves club optional while gender is required"),
    "test_the_acknowledgment_notice_names_the_public_entrant_list": (
        _RENDER, "states at the point of consent that the name will be published"),
    # ---- gender filtering and its override (R12 / Q14 §5) --------------
    "test_the_event_list_narrows_to_the_players_gender": (
        _QUOTE, "narrows the event list to the echoed gender"),
    "test_the_override_control_puts_every_event_back": (
        _QUOTE, "restores the whole list when Show every event is echoed on"),
    "test_the_refresh_keeps_what_the_entrant_already_typed": (
        _QUOTE, "puts the entrant typing back after the round trip"),
    "test_an_event_already_chosen_is_never_hidden_by_the_filter": (
        _ECHO, "never hides an event this player has already ticked"),
    "test_no_gender_chosen_yet_offers_every_event": (
        _ECHO, "shows everything when no gender has been chosen"),
    # ---- the page's posture --------------------------------------------
    # The headers moved a whole tier: the retired route set its own on the
    # response, and nginx's shared snippet now covers every entrant path.
    # `Cache-Control: no-store` — the half that matters for a document
    # carrying a CSRF nonce — is pinned separately in entry.loader.test.ts.
    "test_the_page_carries_its_own_security_headers": (
        _INGRESS, "applies the shared security-headers snippet on every entrant path"),
    "test_the_page_now_allows_no_script_at_all": (
        _RENDER, "carries no script and no challenge widget at all"),
    "test_the_page_carries_no_challenge_widget": (
        _RENDER, "carries no script and no challenge widget at all"),
    # ---- the success page ----------------------------------------------
    "test_the_success_page_carries_no_manage_code": (
        _RECEIPT, "server-renders the reference, the recorded total and the payment terms"),
    "test_the_success_page_lists_every_entry_of_the_act_and_the_total": (
        _RECEIPT, "server-renders the reference, the recorded total and the payment terms"),
    # ---- deliberate drops, four of them, all the same kind --------------
    #
    # These asserted properties of a hand-rolled `<style>` block that the
    # retired route inlined into its own document. There is no such block
    # any more: the entrant tier renders through the design system's
    # Tailwind build, so the successor assertion would have to be a check on
    # class-name *spelling*, which login.test.ts already says plainly is not
    # viewport coverage. A spelling check dressed as a layout guarantee is
    # worse than an honest gap, so these are recorded as lost rather than
    # replaced with something that cannot fail for the right reason. R11's
    # two co-equal widths are held by the design system and by review.
    "test_the_page_is_built_for_a_390px_screen":
        "asserted `<style>` contents the entrant tier does not emit; R11 "
        "width acceptance is not unit-testable without a browser",
    "test_the_page_carries_both_a_phone_layout_and_a_desktop_layout":
        "same: a media query and a grid-template in an inlined stylesheet "
        "that no longer exists",
    "test_nothing_in_the_stylesheet_fixes_a_pixel_width":
        "same: grepped the inlined stylesheet for `width: <n>px`",
    # The retired success page said where an entry lives without linking a
    # page E2 had not built. The receipt page links `/e/{slug}` and
    # login.test.ts derives that no href points into a FastAPI-owned prefix,
    # so the dead-link half is covered; the "says where it lives" half is
    # copy this page does not currently carry.
    "test_the_success_page_points_at_my_entries_without_pretending_it_exists":
        "copy claim about a sentence the RR7 receipt does not carry; the "
        "dead-link half it guarded is held by login.test.ts's derived "
        "no-FastAPI-href control",
}


def _test_names(path: Path) -> set[str]:
    """Every test this file declares, read from the source.

    Two dialects because the migration crosses tiers: pytest functions are
    read with ``ast`` (the same technique as
    ``test_csrf_cookie_registry.py``), vitest cases with a regex over
    ``test('…')`` / ``it('…')`` — both forms, because the entrant suite
    declares with ``it`` inside a ``describe`` and a regex that knew only
    ``test(`` would find nothing there and report every row as missing.
    """
    source = path.read_text(encoding="utf-8")
    if path.suffix == ".py":
        return {
            node.name
            for node in ast.walk(ast.parse(source))
            if isinstance(node, ast.FunctionDef) and node.name.startswith("test_")
        }
    return set(re.findall(r"""\b(?:test|it)\(\s*['"](.+?)['"]""", source))


def test_the_superseded_file_is_gone():
    """The cut-over, from the ledger's side.

    Before deletion this module asserted that every row named a real test in
    that file and that the two dicts together named all 92 of them; both
    were green at the moment it was removed (Task 31's pre-flight, 74 + 18).
    What is left to hold is that nothing brought it back — a resurrected
    file would mean two implementations of the same surface, which is
    precisely what the phase forbade.
    """
    assert not _OLD.exists(), (
        f"{_OLD} is back. The HTML entry surface it tested was deleted in "
        "SP-PROGRAM-1 Phase 6; its 92 claims live in the successors named "
        "in SUPERSEDED and RENDER_TIER, or in the latter's written drops."
    )


def test_every_successor_named_in_the_ledger_exists():
    """The ledger's whole remaining job: the 88 migrated claims must still
    be somewhere. Deleting a successor deletes a claim, and this is what
    says so by name — across both tiers, because a vitest case is exactly
    as deletable as a pytest one."""
    rows = dict(SUPERSEDED)
    rows.update(
        {old: v for old, v in RENDER_TIER.items() if isinstance(v, tuple)}
    )

    missing: list[str] = []
    for old, (rel, successor) in sorted(rows.items()):
        target = _PRODUCT_ROOT / rel
        if not target.exists() or successor not in _test_names(target):
            missing.append(f"{old} -> {rel}::{successor}")

    assert not missing, (
        "These superseded tests have no successor yet:\n  " + "\n  ".join(missing)
    )
