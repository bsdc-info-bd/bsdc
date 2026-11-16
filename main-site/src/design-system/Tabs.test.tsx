import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Tabs } from './Tabs';

function Harness() {
  const [activeId, setActiveId] = useState('one');
  return (
    <Tabs
      label="Sections"
      activeId={activeId}
      onChange={setActiveId}
      items={[
        { id: 'one', label: 'One', content: <p>First</p> },
        { id: 'two', label: 'Two', content: <p>Second</p> },
        { id: 'three', label: 'Three', content: <p>Third</p> },
      ]}
    />
  );
}

describe('Tabs roving keyboard focus', () => {
  it('moves focus along with selection on ArrowRight, ArrowLeft, End, and Home', () => {
    render(<Harness />);
    const one = screen.getByRole('tab', { name: 'One' });
    const two = screen.getByRole('tab', { name: 'Two' });
    const three = screen.getByRole('tab', { name: 'Three' });

    one.focus();
    expect(document.activeElement).toBe(one);

    fireEvent.keyDown(one, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(two);
    expect(two).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(two, { key: 'End' });
    expect(document.activeElement).toBe(three);
    expect(three).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(three, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(two);

    fireEvent.keyDown(two, { key: 'Home' });
    expect(document.activeElement).toBe(one);
  });
});
