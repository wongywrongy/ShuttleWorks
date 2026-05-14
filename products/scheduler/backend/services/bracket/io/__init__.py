"""Import / export pipelines for the tournament prototype.

- ``import_matches`` parses externally-prepared draws (JSON + CSV) into
  a ``TournamentSlot`` ready to live in the backend container.
- ``export_schedule`` renders the current state as CSV (order of play)
  or ICS (iCalendar feed).
"""
