import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplateCard } from '../TemplateCard';
import { TEMPLATES } from '../newWorkspaceTemplates';

const meetDay = TEMPLATES.find((t) => t.id === 'meet-day')!;

describe('TemplateCard', () => {
  it('distinguishes enabled vs available modules and fires onSelect', () => {
    const onSelect = vi.fn();
    render(<TemplateCard template={meetDay} selected={false} onSelect={onSelect} />);
    // Meet Day: meet enabled, display enabled, bracket available
    expect(screen.getByTestId('tplchip-meet')).toHaveAttribute('data-status', 'enabled');
    expect(screen.getByTestId('tplchip-bracket')).toHaveAttribute('data-status', 'available');
    fireEvent.click(screen.getByTestId('template-meet-day'));
    expect(onSelect).toHaveBeenCalled();
  });
});
