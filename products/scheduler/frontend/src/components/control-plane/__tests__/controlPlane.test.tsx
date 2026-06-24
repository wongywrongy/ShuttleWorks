import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricStat, HealthDot, EmptyState, Skeleton, SectionCard, healthColorClass } from '../index';

describe('control-plane primitives', () => {
  it('MetricStat shows label + value', () => {
    render(<MetricStat label="Active" value={3} testId="m-active" />);
    expect(screen.getByTestId('m-active')).toHaveTextContent('Active');
    expect(screen.getByTestId('m-active')).toHaveTextContent('3');
  });
  it('healthColorClass maps health to a token class', () => {
    expect(healthColorClass('good')).toContain('accent');
    expect(healthColorClass('attention')).toContain('warning');
    expect(healthColorClass('draft')).toContain('muted');
  });
  it('HealthDot renders a dot element', () => {
    const { container } = render(<HealthDot health="attention" />);
    expect(container.querySelector('span[aria-hidden]')).toBeTruthy();
  });
  it('EmptyState shows title + body + action', () => {
    render(<EmptyState title="No workspaces" body="Create one" action={<button>Create</button>} />);
    expect(screen.getByText('No workspaces')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });
  it('Skeleton renders the requested number of rows', () => {
    render(<Skeleton rows={3} />);
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(3);
  });
  it('SectionCard shows the eyebrow + children', () => {
    render(<SectionCard eyebrow="MODULES"><p>body</p></SectionCard>);
    expect(screen.getByText('MODULES')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});
