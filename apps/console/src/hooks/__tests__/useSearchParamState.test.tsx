import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom';
import { useSearchParamState } from '../useSearchParamState';

function Harness() {
  const [query, setQuery] = useSearchParamState('q', '', { debounceMs: 20 });
  const [, setParams] = useSearchParams();
  return (
    <>
      <input aria-label="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
      <button
        type="button"
        onClick={() =>
          setParams((previous) => {
            const next = new URLSearchParams(previous);
            next.set('page', '2');
            return next;
          }, { replace: true })
        }
      >
        Page 2
      </button>
      <LocationText />
    </>
  );
}

function LocationText() {
  return <output data-testid="search">{useLocation().search}</output>;
}

describe('useSearchParamState', () => {
  it('merges a debounced query with a concurrent page update', async () => {
    render(
      <MemoryRouter initialEntries={['/?page=1&status=ready']}>
        <Harness />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'late' } });
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('q=late'));
    expect(screen.getByTestId('search')).toHaveTextContent('page=2');
    expect(screen.getByTestId('search')).toHaveTextContent('status=ready');
  });
});
