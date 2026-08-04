"""bracket — one draw format end-to-end (se | rr | swiss | monrad |
compass | double_elimination), selected via ``--format``."""
from __future__ import annotations

from ..context import RunContext
from .base import play_out_bracket, setup_bracket, verify_bracket

FORMATS = ("se", "rr", "swiss", "monrad", "compass", "de")


class Bracket:
    name = "bracket"
    description = "one bracket event of a chosen format, generated + scheduled + played to completion"

    def __init__(self, fmt: str = "se", participants: int = 16):
        if fmt not in FORMATS:
            raise ValueError(f"unknown format {fmt!r}; pick one of {FORMATS}")
        self.fmt = fmt
        self.participants = participants

    def run(self, ctx: RunContext, phase_cb) -> None:
        events = setup_bracket(
            ctx, phase_cb,
            name=f"Sim Bracket {self.fmt} (seed {ctx.seed})",
            formats=[self.fmt],
            participants=self.participants,
        )
        play_out_bracket(ctx, phase_cb, events)
        verify_bracket(ctx, phase_cb, events)
