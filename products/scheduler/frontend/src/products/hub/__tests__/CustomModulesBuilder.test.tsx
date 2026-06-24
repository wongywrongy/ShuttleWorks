import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomModulesBuilder } from '../CustomModulesBuilder';
import { DEFAULT_CUSTOM } from '../customModules';

describe('CustomModulesBuilder', () => {
  it('changing a module state calls onChange', () => {
    const onChange = vi.fn();
    render(<CustomModulesBuilder state={DEFAULT_CUSTOM} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('custom-bracket-enabled'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_CUSTOM, bracket: 'enabled' });
  });
  it('warns when Display is on with no enabled operator', () => {
    render(<CustomModulesBuilder state={{ meet: 'available', bracket: 'off', display: 'enabled' }} onChange={() => {}} />);
    expect(screen.getByTestId('custom-display-hint')).toBeInTheDocument();
  });
});
