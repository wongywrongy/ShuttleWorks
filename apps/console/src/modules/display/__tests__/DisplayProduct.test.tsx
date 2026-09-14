import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { DisplayProduct } from '../DisplayProduct';
import { apiClient } from '../../../api/client';

vi.mock('../../../api/client', () => ({
  apiClient: { getDisplayToken: vi.fn(), rotateDisplayToken: vi.fn() },
}));

function Destination() {
  return <div data-testid="destination">{useLocation().pathname}</div>;
}

describe('DisplayProduct', () => {
  it('opens canonical board settings without retrieving or issuing a bearer', async () => {
    render(<MemoryRouter initialEntries={['/tournaments/abc123/display']}>
      <Routes>
        <Route path="/tournaments/:id/display" element={<DisplayProduct />} />
        <Route path="/tournaments/:id/display/board" element={<Destination />} />
      </Routes>
    </MemoryRouter>);
    expect(await screen.findByTestId('destination')).toHaveTextContent('/tournaments/abc123/display/board');
    expect(apiClient.getDisplayToken).not.toHaveBeenCalled();
    expect(apiClient.rotateDisplayToken).not.toHaveBeenCalled();
  });
});
