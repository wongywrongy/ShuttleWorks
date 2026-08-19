"""WinnerModel — seeded Elo-lite result generation.

``p(A wins) = 1 / (1 + 10^((rB - rA) / 400))`` with the draw taken from a
per-match RNG stream, so results are reproducible per seed AND independent
of play order (recording match 7 before match 3 changes nothing).

Upsets happen (unlike the backend bracket CLI's top-seed-always-wins),
which exercises losers brackets, compass segments, and Swiss pairing
variety.
"""
from __future__ import annotations

from typing import Iterable, Literal

from .rng import derive_rng

Side = Literal["A", "B"]


class WinnerModel:
    def __init__(self, seed: int, ratings: dict[str, float]):
        self.seed = seed
        self.ratings = ratings

    def _rating(self, entrant_ids: Iterable[str]) -> float:
        ids = list(entrant_ids)
        if not ids:
            return 1200.0
        return sum(self.ratings.get(i, 1200.0) for i in ids) / len(ids)

    def winner(self, match_id: str, side_a: Iterable[str], side_b: Iterable[str]) -> Side:
        ra, rb = self._rating(side_a), self._rating(side_b)
        p_a = 1.0 / (1.0 + 10.0 ** ((rb - ra) / 400.0))
        rng = derive_rng(self.seed, "result", match_id)
        return "A" if rng.random() < p_a else "B"

    def sets(self, match_id: str, winner: Side) -> list[list[int]]:
        """Badminton set scores: winner takes 2-0 or 2-1, loser points 5..19."""
        rng = derive_rng(self.seed, "score", match_id)
        three_sets = rng.random() < 0.3
        sets: list[list[int]] = []

        def one_set(won_by_winner: bool) -> list[int]:
            loser_pts = rng.randint(5, 19)
            w, l = (21, loser_pts)
            return [w, l] if won_by_winner else [l, w]

        if three_sets:
            drop = rng.randint(1, 2)  # which set the winner drops
            sets = [one_set(s != drop) for s in range(1, 4)]
        else:
            sets = [one_set(True), one_set(True)]
        # Sets above are [winner_pts, loser_pts] — flip to side order when B won.
        if winner == "B":
            sets = [[b, a] for a, b in sets]
        return sets

    def meet_score(self, match_id: str, winner: Side) -> dict:
        """Meet ``MatchScore`` shape ({sideA, sideB}, ints) — sets won."""
        rng = derive_rng(self.seed, "score", match_id)
        loser_sets = 1 if rng.random() < 0.3 else 0
        a, b = (2, loser_sets) if winner == "A" else (loser_sets, 2)
        return {"sideA": a, "sideB": b}

    def bracket_score(self, match_id: str, winner: Side) -> dict:
        """Set-by-set score blob for bracket ``record_result``.

        The backend stores this opaquely, but the FRONTEND's contract is
        ``{sets: [{sideA, sideB}, ...]}`` (BracketSetScore — see
        DrawView.tsx / BracketScoreEntry.tsx). Any other shape renders as
        "undefined-undefined" on the draw board, so the sim must speak the
        app's real dialect.
        """
        return {
            "sets": [{"sideA": a, "sideB": b} for a, b in self.sets(match_id, winner)]
        }
