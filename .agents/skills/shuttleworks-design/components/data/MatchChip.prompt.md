The atom of the Run and Plan court boards. Muted-solid fill for active states (live/called), outline for quiet ones (scheduled/done). Absolutely position it on a court×time lane, or use inline in a queue.

```jsx
<MatchChip code="MS1" players="Chen v Webb" state="live" meta="14:32" />
<MatchChip code="XD1" source="B" state="called" />
<MatchChip code="WD2" players="Kim v Tan" state="live" lateBy="2" />
<MatchChip code="MS3" state="done" />
```

- `state`: `scheduled` (outline) · `called` (amber solid) · `live` (emerald solid) · `done` (dim, struck-through)
- `source`: `M`/`B` initial square distinguishes Meet vs Bracket matches.
- `lateBy`: shows a `+N` amber marker and tints the live border amber.
- On a lane, pass `style={{ position:'absolute', left, width, top, height }}`.
