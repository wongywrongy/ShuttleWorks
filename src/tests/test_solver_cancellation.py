"""Cancellation token: thin holder threaded into solver callbacks.

The worker calls cancel() from one task; the solve loop polls
the token from another. asyncio.Event would be heavier (and
require an event loop reachable from the OR-Tools callback,
which is C++); a threading.Event works because OR-Tools'
callback runs on a worker thread when num_workers > 1.
"""
import threading
import time

from scheduler_core.engine.cancel_token import CancelToken
from scheduler_core.engine.warm_start import solve_warm_start
from tests.helpers.solver_fixtures import make_minimal_warm_start_inputs


def test_token_starts_uncancelled():
    t = CancelToken()
    assert not t.is_cancelled()


def test_cancel_flips_to_cancelled():
    t = CancelToken()
    t.cancel()
    assert t.is_cancelled()


def test_cancel_is_idempotent():
    t = CancelToken()
    t.cancel()
    t.cancel()
    assert t.is_cancelled()


def test_cancel_is_thread_safe():
    """Concurrent cancel() from many threads must never raise."""
    t = CancelToken()

    def runner():
        for _ in range(1000):
            t.cancel()

    threads = [threading.Thread(target=runner) for _ in range(8)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    assert t.is_cancelled()


def test_cancel_aborts_running_solve():
    """A cancel issued shortly after solve start must return
    quickly with whatever the solver had — never run to the
    full time_limit_seconds."""
    inputs = make_minimal_warm_start_inputs()
    token = CancelToken()

    timer = threading.Timer(0.2, token.cancel)
    timer.start()
    try:
        start = time.monotonic()
        solve_warm_start(
            inputs.config,
            inputs.players,
            inputs.matches,
            inputs.reference,
            finished_match_ids=set(),
            stay_close_weight=10,
            solver_options=inputs.options_with_long_budget,  # 10 s budget
            cancel_token=token,
        )
        elapsed = time.monotonic() - start
        assert elapsed < 2.0, (
            f"solve_warm_start ignored cancellation; ran {elapsed:.2f}s "
            f"of 10s budget"
        )
    finally:
        timer.cancel()
