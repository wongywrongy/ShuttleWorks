import { Button } from '@scheduler/design-system/components';

import type { Route } from './+types/health';

export function loader() {
  return { tier: 'entrant' };
}

export default function Health({ loaderData }: Route.ComponentProps) {
  return (
    <main>
      <h1 data-testid="entrant-health">entrant tier is up</h1>
      <p data-testid="entrant-tier">{loaderData.tier}</p>
      {/* Not decoration: this is the standing proof that a design-system
          primitive server-renders on this tier. Modal is deliberately absent —
          spec §5 rules it browser-only and out of Phase 6. */}
      <Button variant="brand" type="button">
        design system
      </Button>
    </main>
  );
}
