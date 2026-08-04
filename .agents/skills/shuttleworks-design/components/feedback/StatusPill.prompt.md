Workspace/match status pill — tinted square swatch + uppercase mono label. Sits in identity bars and inspectors. Live variants breathe.

```jsx
<StatusPill status="ready" />
<StatusPill status="live" />
<StatusPill status="called">Called</StatusPill>
```

- `status`: `ready` · `live` (pulses) · `called` · `drawn` · `sched` · `draft`
- Uses `color-mix` for the 10%-fill / 30%-border tint from a single status hue.
