import { describe, it, expect } from 'vitest';
import { workspaceNoun, workspaceCopy } from '../workspace';

describe('workspaceNoun', () => {
  it('exposes the user-facing container noun in four cases', () => {
    expect(workspaceNoun.lower).toBe('workspace');
    expect(workspaceNoun.title).toBe('Workspace');
    expect(workspaceNoun.lowerPlural).toBe('workspaces');
    expect(workspaceNoun.titlePlural).toBe('Workspaces');
  });
});

describe('workspaceCopy', () => {
  it('derives Hub + chrome copy from the noun (single source of truth)', () => {
    expect(workspaceCopy.dashboardDescription).toBe(
      'Workspaces you own or have been invited to.',
    );
    expect(workspaceCopy.ownedSectionTitle).toBe('Your workspaces');
    expect(workspaceCopy.ownedEmptyHint).toBe("You don't own any workspaces yet.");
    expect(workspaceCopy.tabsAriaLabel).toBe('Workspace tabs');
  });
});
