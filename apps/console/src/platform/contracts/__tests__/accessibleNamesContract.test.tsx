/**
 * Accessible-names contract (v3 consolidated plan, package 26a, WCAG 2.2 AA
 * "Info and Relationships" / "Name, Role, Value"): every interactive element
 * rendered by a shared primitive must expose an accessible name a screen
 * reader can announce — a visible label, an `aria-label`, or equivalent.
 *
 * This renders each shared component with the minimal props a real caller
 * would supply and asserts the resulting control is reachable via
 * `getByRole(..., { name })`. If a component regresses to an icon-only or
 * unlabeled control, `getByRole` throws and the test fails loudly rather
 * than silently passing on an unnamed node.
 *
 * Scope: design-system Button/Checkbox/FormActions/Select/TextField,
 * control-plane DenseDataTable rows/checkboxes/sort buttons, OverflowMenu
 * trigger, and ActiveChoice (all four semantics).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { Button, Checkbox, FormActions, Select, TextField } from '@scheduler/design-system';
import { DenseDataTable } from '../../../components/control-plane/DenseDataTable';
import { DEFAULT_DENSE_DATA_STATE, type DenseDataColumn } from '../../../components/control-plane/denseData';
import { OverflowMenu } from '../../../components/control-plane/OverflowMenu';
import { ActiveChoice, type ActiveChoiceSemantics } from '../../../components/ActiveChoice';

describe('accessible names contract — shared interactive components', () => {
  it('Button exposes its visible text as the accessible name', () => {
    render(<Button>Save changes</Button>);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('Button with icon-only content still needs an explicit name (aria-label)', () => {
    render(
      <Button aria-label="Close panel" size="icon">
        <span aria-hidden>×</span>
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Close panel' })).toBeInTheDocument();
  });

  it('Checkbox derives its accessible name from the wrapping <label>', () => {
    render(<Checkbox label="Enable notifications" onChange={() => {}} />);
    expect(screen.getByRole('checkbox', { name: 'Enable notifications' })).toBeInTheDocument();
  });

  it('TextField derives its accessible name from the associated <label>', () => {
    render(<TextField label="Tournament name" onChange={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'Tournament name' })).toBeInTheDocument();
  });

  it('Select trigger exposes an accessible name via ariaLabel', () => {
    render(
      <Select
        value=""
        onValueChange={() => {}}
        options={[{ value: 'a', label: 'Option A' }]}
        ariaLabel="Choose a court"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Choose a court' })).toBeInTheDocument();
  });

  it('FormActions Save/Discard buttons are named, and the clean reason is announced', () => {
    render(<FormActions dirty onSave={() => {}} onDiscard={() => {}} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('FormActions clean-state Save names its disabled reason', () => {
    render(<FormActions dirty={false} onSave={() => {}} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    expect(screen.getByText('No changes')).toBeInTheDocument();
  });

  it('OverflowMenu trigger has a default accessible name', () => {
    render(<OverflowMenu items={[{ key: 'a', label: 'Rename', onSelect: () => {} }]} />);
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('OverflowMenu trigger honors a caller-supplied label', () => {
    render(
      <OverflowMenu label="Row actions for Court 3" items={[{ key: 'a', label: 'Rename', onSelect: () => {} }]} />,
    );
    expect(screen.getByRole('button', { name: 'Row actions for Court 3' })).toBeInTheDocument();
  });

  it.each<ActiveChoiceSemantics>(['tab', 'radio', 'pressed'])(
    'ActiveChoice (%s semantics) exposes its children as the accessible name',
    (semantics) => {
      const role = semantics === 'tab' ? 'tab' : semantics === 'radio' ? 'radio' : 'button';
      render(
        <ActiveChoice active geometry="segment" semantics={semantics} onClick={() => {}}>
          Doubles
        </ActiveChoice>,
      );
      expect(screen.getByRole(role, { name: 'Doubles' })).toBeInTheDocument();
    },
  );

  it('ActiveChoice with "page" semantics (a Link) is reachable by its text', () => {
    render(
      <MemoryRouter>
        <ActiveChoice active geometry="row" semantics="page" to="/overview">
          Overview
        </ActiveChoice>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
  });

  it('DenseDataTable: sort buttons, select-page checkbox and row checkboxes are all named', () => {
    interface Row {
      id: string;
      name: string;
    }
    const columns: DenseDataColumn<Row>[] = [
      { id: 'name', label: 'Name', accessor: (row) => row.name },
    ];
    const rows: Row[] = [{ id: '1', name: 'Mina Park' }];
    render(
      <DenseDataTable
        rows={rows}
        columns={columns}
        state={DEFAULT_DENSE_DATA_STATE}
        onStateChange={vi.fn()}
        rowId={(row) => row.id}
        selectable
        onSelectedIdsChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Name: Sort/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select page' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select 1' })).toBeInTheDocument();
  });

  it('DenseDataTable pagination controls (Previous/Next page) are named', () => {
    interface Row {
      id: string;
      name: string;
    }
    const columns: DenseDataColumn<Row>[] = [
      { id: 'name', label: 'Name', accessor: (row) => row.name },
    ];
    render(
      <DenseDataTable
        rows={[{ id: '1', name: 'Mina Park' }]}
        columns={columns}
        state={DEFAULT_DENSE_DATA_STATE}
        onStateChange={vi.fn()}
        rowId={(row) => row.id}
      />,
    );
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument();
  });
});
