import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders its label and fires onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>পোস্ট করুন</Button>);
    const button = screen.getByRole('button', { name: 'পোস্ট করুন' });
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled and marked busy while loading', () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
