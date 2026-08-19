"""The day-of control plane over both engines' matches: the canonical
match-state machine, the idempotent command log and the conflict metrics
the boards render.

Operations deliberately does NOT reach into Bracket. Results travel the
command path (ADR 0007); import-linter contract 4 pins that absence.
"""
