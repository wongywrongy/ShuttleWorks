import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DENSE_DATA_STATE,
  createDenseDataViewStore,
  decodeDenseDataState,
  denseDataViewStorageKey,
  encodeDenseDataState,
  getDenseDataFacetOptions,
  getDenseDataPage,
  mergeDenseDataStateParams,
  setDenseSort,
  type DenseDataColumn,
  type DenseDataStorage,
} from '../denseData';

interface Row {
  id: string;
  name: string;
  event: string;
  rank: number;
}

const columns: DenseDataColumn<Row>[] = [
  { id: 'name', label: 'Name', accessor: (row) => row.name },
  { id: 'event', label: 'Event', accessor: (row) => row.event },
  { id: 'rank', label: 'Rank', accessor: (row) => row.rank },
];

const rows: Row[] = [
  { id: '1', name: 'Zoe', event: 'MS', rank: 12 },
  { id: '2', name: 'Amir', event: 'MD', rank: 2 },
  { id: '3', name: 'Mina', event: 'MS', rank: 4 },
];

describe('dense data state', () => {
  it('filters, sorts, and pages without mutating the source rows', () => {
    const state = {
      ...DEFAULT_DENSE_DATA_STATE,
      search: 'm',
      sort: { id: 'rank', direction: 'asc' as const },
      pageSize: 50 as const,
    };
    const page = getDenseDataPage(rows, columns, state);
    // Search intentionally spans all column values: Zoe's MS event matches
    // the query as well as the two names, and rank sorting remains stable.
    expect(page.rows.map((row) => row.name)).toEqual(['Amir', 'Mina', 'Zoe']);
    expect(rows.map((row) => row.name)).toEqual(['Zoe', 'Amir', 'Mina']);
  });

  it('uses OR semantics within a facet and AND semantics between facets', () => {
    const page = getDenseDataPage(rows, columns, {
      ...DEFAULT_DENSE_DATA_STATE,
      filters: { event: ['MS'] },
    });
    expect(page.rows.map((row) => row.id)).toEqual(['1', '3']);
  });

  it('returns stable facet counts', () => {
    expect(getDenseDataFacetOptions(rows, columns[1])).toEqual([
      { value: 'MD', label: 'MD', count: 1 },
      { value: 'MS', label: 'MS', count: 2 },
    ]);
  });

  it('keeps a 251-player roster paged and searchable for operator scale', () => {
    const roster = Array.from({ length: 251 }, (_, index) => ({
      id: `p-${index + 1}`,
      name: index === 250 ? 'Late Partner' : `Player ${index + 1}`,
      event: index % 2 ? 'MS' : 'MD',
      rank: index + 1,
    }));
    const page = getDenseDataPage(roster, columns, {
      ...DEFAULT_DENSE_DATA_STATE,
      pageSize: 50,
      page: 6,
    });
    expect(page.total).toBe(251);
    expect(page.pageCount).toBe(6);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].name).toBe('Late Partner');
    expect(getDenseDataPage(roster, columns, { ...DEFAULT_DENSE_DATA_STATE, search: 'late partner' }).rows).toHaveLength(1);
  });

  it('cycles a sort from ascending to descending to cleared', () => {
    const first = setDenseSort(DEFAULT_DENSE_DATA_STATE, 'name');
    const second = setDenseSort(first, 'name');
    const third = setDenseSort(second, 'name');
    expect(first.sort).toEqual({ id: 'name', direction: 'asc' });
    expect(second.sort).toEqual({ id: 'name', direction: 'desc' });
    expect(third.sort).toBeNull();
  });
});

describe('dense data URL state', () => {
  it('round-trips state and leaves unrelated query parameters alone', () => {
    const state = {
      ...DEFAULT_DENSE_DATA_STATE,
      search: 'late pair',
      sort: { id: 'rank', direction: 'desc' as const },
      filters: { event: ['MD', 'MS'] },
      hiddenColumns: ['rank'],
      density: 'compact' as const,
      page: 2,
      pageSize: 100 as const,
      groupBy: 'event',
    };
    const encoded = encodeDenseDataState(state, 'matches');
    expect(decodeDenseDataState(encoded, undefined, 'matches')).toMatchObject(state);
    const merged = mergeDenseDataStateParams('id=abc&matches.q=old&keep=yes', state, 'matches');
    expect(merged.get('keep')).toBe('yes');
    expect(merged.get('id')).toBe('abc');
    expect(merged.get('matches.q')).toBe('late pair');
    expect(merged.get('matches.filter.event')).toBe('MD,MS');
  });

  it('rejects invalid paging values and defaults unknown directions to ascending', () => {
    const state = decodeDenseDataState('table.page=-2&table.pageSize=25&table.sort=name&table.dir=sideways');
    expect(state.page).toBe(1);
    expect(state.pageSize).toBe(50);
    expect(state.sort).toEqual({ id: 'name', direction: 'asc' });
  });
});

describe('dense data saved views', () => {
  it('scopes views to user, workspace, and view id', () => {
    const values = new Map<string, string>();
    const storage: DenseDataStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    const state = { ...DEFAULT_DENSE_DATA_STATE, search: 'unpaid' };
    const first = createDenseDataViewStore({ userId: 'operator/1', workspaceId: 'event-a', viewId: 'participants', storage });
    const other = createDenseDataViewStore({ userId: 'operator/2', workspaceId: 'event-a', viewId: 'participants', storage });
    first.save({ id: 'unpaid', name: 'Unpaid entries', state });
    expect(first.list()).toHaveLength(1);
    expect(other.list()).toEqual([]);
    expect(denseDataViewStorageKey('operator/1', 'event-a', 'participants')).toContain('operator%2F1');
    first.remove('unpaid');
    expect(first.list()).toEqual([]);
  });
});
