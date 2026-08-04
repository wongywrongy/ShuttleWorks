Primary/secondary/ghost button; primary carries the signature blue glow. Use for all committed actions and toolbar buttons.

```jsx
<Button>Open workspace →</Button>
<Button variant="secondary" size="sm">Import CSV</Button>
<Button variant="ghost">Cancel</Button>
```

- `variant`: `primary` (glowing accent) · `secondary` (bordered card) · `ghost` (chromeless)
- `size`: `sm` (30px, toolbars) · `md` (38px, default) · `lg` (44px, forms/CTAs)
- Set `glow={false}` to drop the halo on dense toolbars.
