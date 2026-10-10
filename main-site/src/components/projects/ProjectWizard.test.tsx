import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as I18nModule from 'react-i18next';
import { EMPTY_PROJECT, type ProjectStep } from '@/lib/create/create-types';
import { ProjectWizard } from './ProjectWizard';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  };
});

function renderStep(step: ProjectStep, onCoverFileChange = vi.fn()) {
  return render(
    <ProjectWizard
      value={EMPTY_PROJECT}
      onChange={vi.fn()}
      step={step}
      coverFile={null}
      coverPreviewUrl=""
      coverUploadProgress={null}
      onCoverFileChange={onCoverFileChange}
      errorFor={() => undefined}
    />,
  );
}

describe('the project publishing wizard', () => {
  it('has separate basics and build stages rather than one long form', () => {
    const { rerender } = renderStep(0);
    expect(screen.getByLabelText('create.fields.name')).toBeInTheDocument();
    expect(screen.getByLabelText('create.fields.description')).toBeInTheDocument();
    expect(screen.queryByLabelText('create.fields.repoUrl')).not.toBeInTheDocument();

    rerender(
      <ProjectWizard
        value={EMPTY_PROJECT}
        onChange={vi.fn()}
        step={1}
        coverFile={null}
        coverPreviewUrl=""
        coverUploadProgress={null}
        onCoverFileChange={vi.fn()}
        errorFor={() => undefined}
      />,
    );
    expect(screen.getByLabelText('create.fields.repoUrl')).toBeInTheDocument();
    expect(screen.getByLabelText('create.fields.tech')).toBeInTheDocument();
  });

  it('offers a real image file input for the Cloudinary cover step', () => {
    const onCoverFileChange = vi.fn();
    const { container } = renderStep(2, onCoverFileChange);
    const input = screen.getByLabelText('create.projectSteps.chooseCover');
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp,image/gif,image/avif');
    fireEvent.change(input, {
      target: { files: [new File(['cover'], 'cover.webp', { type: 'image/webp' })] },
    });
    expect(onCoverFileChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'cover.webp' }));
    expect(container.querySelector('input[type="file"]')).toBeInTheDocument();
  });
});
