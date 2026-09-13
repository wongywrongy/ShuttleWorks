"""The old two-commit seam is retired; binding must have one transaction owner."""
import inspect
from competition import service
from entries import entries


def test_registration_module_no_longer_owns_commit_or_binding():
    assert not hasattr(entries, 'commit_entries')
    assert entries.roster_id('player') == 'entry-player'


def test_competition_commands_never_commit_an_outer_transaction():
    # Runtime rollback and projection invariants live in test_competition.py.
    assert '.commit(' not in inspect.getsource(service)
