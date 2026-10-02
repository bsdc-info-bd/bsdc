import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('falls back to initials and keeps the name accessible', () => {
    render(<Avatar name="Rizwan Rahim" />);
    expect(screen.getByText('Rizwan Rahim')).toBeInTheDocument();
  });

  it('renders the image with the name as alternative text', () => {
    render(<Avatar name="BSDC" src="https://res.cloudinary.com/dpemuwrpz/image/upload/x.png" />);
    expect(screen.getByRole('img', { name: 'BSDC' })).toBeInTheDocument();
  });
});
