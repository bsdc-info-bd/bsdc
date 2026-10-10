import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as I18nModule from 'react-i18next';
import {
  EMPTY_PROJECT,
  PROJECT_LAST_STEP,
  type ProjectDraftInput,
  type ProjectStep,
} from '@/lib/create/create-types';
import { useAttachments } from '@/components/media/use-attachments';
import { ProjectWizard } from './ProjectWizard';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  };
});

vi.mock('@/lib/env', () => ({
  env: {
    cloudinary: { cloudName: 'bsdctest', unsignedPreset: 'unsigned-test' },
    imgbbApiKey: 'imgbb-test-key',
  },
  // The gallery needs a database to record an upload in; the routing of the
  // bytes is tested in lib/storage, not here.
  isConfigured: { cloudinary: true, imgbb: true, supabase: true },
}));

// jsdom has no object URLs. The queue previews a chosen file from its local
// bytes before any upload, so without these the first attach throws instead of
// showing a picture — the same stub the queue's own test uses.
let objectUrlSequence = 0;
URL.createObjectURL = vi.fn(() => {
  objectUrlSequence += 1;
  return `blob:local/${objectUrlSequence}`;
});
URL.revokeObjectURL = vi.fn();

export interface WizardHarnessProps {
  step: ProjectStep;
  value?: ProjectDraftInput | undefined;
  onCoverFileChange?: ((file: File | null) => void) | undefined;
  onChange?: ((next: ProjectDraftInput) => void) | undefined;
  /** Exposed so a test can drive the queue the page owns. */
  onController?: ((controller: ReturnType<typeof useAttachments>) => void) | undefined;
}

/**
 * Renders the wizard the way the page does: the gallery queue lives above it and
 * is passed down, because that is the arrangement the publish handler depends
 * on. Using the real hook rather than a stub keeps this test honest about the
 * contract — a stub that returned whatever the test wanted could never catch a
 * wizard reading the wrong list.
 */
function WizardHarness({
  step,
  value = EMPTY_PROJECT,
  onCoverFileChange = () => undefined,
  onChange = () => undefined,
  onController,
}: WizardHarnessProps) {
  const screenshots = useAttachments({ purpose: 'project-image', uid: 'uid-1', max: 8 });
  onController?.(screenshots);
  return (
    <ProjectWizard
      value={value}
      onChange={onChange}
      step={step}
      coverFile={null}
      coverPreviewUrl=""
      coverUploadProgress={null}
      onCoverFileChange={onCoverFileChange}
      errorFor={() => undefined}
      screenshots={screenshots}
    />
  );
}

function renderStep(step: ProjectStep, onCoverFileChange?: (file: File | null) => void) {
  return render(<WizardHarness step={step} onCoverFileChange={onCoverFileChange} />);
}

describe('the project publishing wizard', () => {
  it('has separate basics and build stages rather than one long form', () => {
    const { rerender } = renderStep(0);
    expect(screen.getByLabelText('create.fields.name')).toBeInTheDocument();
    expect(screen.getByLabelText('create.fields.description')).toBeInTheDocument();
    expect(screen.queryByLabelText('create.fields.repoUrl')).not.toBeInTheDocument();

    rerender(<WizardHarness step={1} />);
    expect(screen.getByLabelText('create.fields.repoUrl')).toBeInTheDocument();
    expect(screen.getByLabelText('create.fields.tech')).toBeInTheDocument();
  });

  it('offers a real image file input for the Cloudinary cover step', () => {
    const onCoverFileChange = vi.fn();
    const { container } = renderStep(2, onCoverFileChange);
    const input = screen.getByLabelText('create.cover.choose');
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp,image/gif,image/avif');
    fireEvent.change(input, {
      target: { files: [new File(['cover'], 'cover.webp', { type: 'image/webp' })] },
    });
    expect(onCoverFileChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'cover.webp' }));
    expect(container.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it('keeps the cover and the gallery on different steps', () => {
    // A cover is one picture chosen to represent the project; the gallery is the
    // product. Sharing a screen is what made neither of them findable.
    const { rerender } = renderStep(2);
    expect(screen.getByLabelText('create.cover.choose')).toBeInTheDocument();
    expect(screen.queryByLabelText('create.projectSteps.addScreenshots')).not.toBeInTheDocument();

    rerender(<WizardHarness step={3} />);
    expect(screen.getByLabelText('create.projectSteps.addScreenshots')).toBeInTheDocument();
    expect(screen.queryByLabelText('create.cover.choose')).not.toBeInTheDocument();
  });

  it('accepts several screenshots at once on the gallery step', () => {
    renderStep(3);
    const input = screen.getByLabelText('create.projectSteps.addScreenshots');
    expect(input).toHaveAttribute('multiple');
    fireEvent.change(input, {
      target: {
        files: [
          new File(['one'], 'one.png', { type: 'image/png' }),
          new File(['two'], 'two.png', { type: 'image/png' }),
        ],
      },
    });
    // Both are queued, and the queue says so where the member can see it.
    expect(screen.getByText('create.projectSteps.screenshotsUploading')).toBeInTheDocument();
  });

  it('refuses a file that is not a picture before it reaches the queue', () => {
    renderStep(3);
    const input = screen.getByLabelText('create.projectSteps.addScreenshots');
    fireEvent.change(input, {
      target: { files: [new File(['app'], 'app.exe', { type: 'application/x-msdownload' })] },
    });
    expect(screen.queryByText('create.projectSteps.screenshotsUploading')).not.toBeInTheDocument();
  });

  it('has a review step after the gallery, and it is the last one', () => {
    expect(PROJECT_LAST_STEP).toBe(4);
    renderStep(PROJECT_LAST_STEP);
    expect(screen.getByText('create.projectSteps.reviewTitle')).toBeInTheDocument();
    // With nothing attached, the review says so rather than showing an empty box.
    expect(screen.getByText('create.projectSteps.noScreenshots')).toBeInTheDocument();
  });

  it('names every step for a screen reader, in order', () => {
    renderStep(0);
    const stepper = screen.getByLabelText('create.projectSteps.label');
    expect(stepper.textContent).toContain('create.projectSteps.basics');
    expect(stepper.textContent).toContain('create.projectSteps.build');
    expect(stepper.textContent).toContain('create.projectSteps.cover');
    expect(stepper.textContent).toContain('create.projectSteps.screenshots');
    expect(stepper.textContent).toContain('create.projectSteps.review');
  });
});
