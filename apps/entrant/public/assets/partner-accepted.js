/** Verify native invite acceptance in the authenticated My Entries projection. */
import { personRefModel } from './person-ref.js';

function text(doc, value) {
  const node = doc.createElement('p');
  node.className = 'text-sm text-muted-foreground';
  node.textContent = value;
  return node;
}

function findEntry(data, entryId) {
  if (!entryId) return null;
  for (const tournament of data?.tournaments ?? []) {
    for (const event of tournament?.events ?? []) {
      if (event?.entryId === entryId) return { tournament, event };
    }
  }
  return null;
}

export async function loadPartnerAccepted(root, fetchImpl = fetch) {
  const doc = root.ownerDocument;
  const entryId = root.dataset.entryId ?? '';
  const heading = doc.querySelector('#partner-accepted-title');
  if (!entryId) {
    root.replaceChildren(text(doc, 'We could not verify this accepted entry. Open My entries to check its status.'));
    return;
  }
  try {
    const response = await fetchImpl('/e/api/me/entries', { headers: { accept: 'application/json' } });
    if (response.status === 401) {
      root.replaceChildren(text(doc, 'Sign in to view the accepted partner details.'));
      return;
    }
    if (!response.ok) throw new Error('entries request failed');
    const data = await response.json();
    const found = findEntry(data, entryId);
    const partnerIdentity = found?.event?.partner?.identity;
    const playerIdentity = found?.event?.player?.identity;
    const partner = partnerIdentity ? personRefModel({ identity: partnerIdentity }).text : '';
    const player = playerIdentity ? personRefModel({ identity: playerIdentity }).text : '';
    if (!found || !partner || !player) {
      root.replaceChildren(text(doc, 'We could not verify the accepted partner entry. Open My entries to check its status.'));
      return;
    }
    if (heading) heading.textContent = 'Entry accepted';
    const tournament = found.tournament?.tournamentName || 'Your tournament';
    const discipline = found.event.discipline || 'Doubles';
    root.replaceChildren(text(doc, `${tournament} · ${discipline}: ${player} with ${partner}.`));
  } catch {
    root.replaceChildren(text(doc, 'We could not verify the accepted partner entry. Open My entries to check its status.'));
  }
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('partner-accepted-details');
  if (root) void loadPartnerAccepted(root);
}
