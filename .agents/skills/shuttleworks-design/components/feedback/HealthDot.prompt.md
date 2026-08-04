A small colored status dot — workspace health in Hub rows, live signals in identity bars. Pulses + glows when `pulse` is set.

```jsx
<HealthDot tone="live" pulse />
<HealthDot tone="called" />
<HealthDot tone="idle" />
```
Tones map to the status ramp: `live` `called` `scheduled` `bracket` `accent` `idle`.
