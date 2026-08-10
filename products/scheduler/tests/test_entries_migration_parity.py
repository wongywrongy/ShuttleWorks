"""The migration ledger for ``tests/test_entries_public_routes.py``.

SP-PROGRAM-1 Phase 6 retires the f-string HTML entry surface
(``api/entries_public.py``'s ``GET /e/{slug}`` and ``POST
/e/{slug}/submit``) and serves the same product from React Router 7 plus a
JSON API. **Submission behaviour is unchanged; only the serving context
moves.** So the ~90 tests that pinned that behaviour are *migrated*, not
deleted — CODE_HEALTH's rule that a superseded test becomes its successor
rather than a gap.

A rule like that lives in review until someone writes it down as a check.
This is the check. Each row of ``SUPERSEDED`` names an old test and the
test that takes over its claim, and two assertions hold the pair honest:

1. every row names a test that really exists in the old file — so a typo
   or a row invented for a test that was never there cannot pad the ledger;
2. every successor named really exists in the file the row points at — so
   a migration cannot be declared done by editing a dict.

The second is deliberately red while the migration is in flight: it fails
by name with exactly the tests still owed. Task 31 (the cut-over) deletes
the old file and flips assertion 1 into "the old file is gone".
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

_PRODUCT_ROOT = Path(__file__).resolve().parents[1]
_OLD = _PRODUCT_ROOT / "tests" / "test_entries_public_routes.py"

_PAGE = "tests/test_entries_page_api.py"

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
        _PAGE, "test_the_projection_lists_entrant_names_and_events_only"),
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
}


def _test_names(path: Path) -> set[str]:
    """Every test this file declares, read from the source.

    Two dialects because the migration crosses tiers: pytest functions are
    read with ``ast`` (the same technique as
    ``test_csrf_cookie_registry.py``), Playwright/vitest cases with a
    regex over ``test('…')``, which is the only declaration form the e2e
    suite uses.
    """
    source = path.read_text(encoding="utf-8")
    if path.suffix == ".py":
        return {
            node.name
            for node in ast.walk(ast.parse(source))
            if isinstance(node, ast.FunctionDef) and node.name.startswith("test_")
        }
    return set(re.findall(r"""\btest\(\s*['"](.+?)['"]""", source))


def test_every_row_names_a_real_superseded_test():
    """No ledger padding: a row for a test the old file never had is a row
    that proves nothing."""
    old = _test_names(_OLD)
    strays = sorted(name for name in SUPERSEDED if name not in old)
    assert not strays, (
        "These rows name tests that do not exist in "
        f"{_OLD.name}:\n  " + "\n  ".join(strays)
    )


def test_every_successor_named_in_the_ledger_exists():
    """The migration itself. Red until the successor is written, and it
    fails by name — the list below is the work still owed."""
    missing: list[str] = []
    for old, (rel, successor) in sorted(SUPERSEDED.items()):
        target = _PRODUCT_ROOT / rel
        if not target.exists() or successor not in _test_names(target):
            missing.append(f"{old} -> {rel}::{successor}")

    assert not missing, (
        "These superseded tests have no successor yet:\n  " + "\n  ".join(missing)
    )
