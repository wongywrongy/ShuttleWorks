import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from '../../../store/uiStore';

describe('uiStore activeTournamentStatus', () => {
  beforeEach(() => {
    useUiStore.getState().setActiveTournamentStatus(null);
  });

  it('defaults to null', () => {
    expect(useUiStore.getState().activeTournamentStatus).toBeNull();
  });

  it('stores and clears the status', () => {
    useUiStore.getState().setActiveTournamentStatus('active');
    expect(useUiStore.getState().activeTournamentStatus).toBe('active');
    useUiStore.getState().setActiveTournamentStatus(null);
    expect(useUiStore.getState().activeTournamentStatus).toBeNull();
  });
});
