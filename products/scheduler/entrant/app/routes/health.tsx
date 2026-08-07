import type { Route } from './+types/health';

export function loader() {
  return { tier: 'entrant' };
}

export default function Health({ loaderData }: Route.ComponentProps) {
  return (
    <main>
      <h1 data-testid="entrant-health">entrant tier is up</h1>
      <p data-testid="entrant-tier">{loaderData.tier}</p>
    </main>
  );
}
