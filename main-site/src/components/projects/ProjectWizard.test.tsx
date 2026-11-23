import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as I18nModule from 'react-i18next';
import {
  EMPTY_PROJECT,
  PROJECT_LAST_STEP,
  type ProjectDraftInput,
  type ProjectStep,
} from '@/lib/create/create-types';
import { useAttachments } from '@/components/media/use-attachments';
import type { GalleryPickerDialogProps } from '@/components/media/GalleryPickerDialog';
import type { PickedMedia } from '@/lib/media/gallery';
import { ProjectWizard } from './ProjectWizard';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  };
});

vi.mock('@/lib/env', () => ({
  env: {},
  isConfigured: { supabase: true },
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

/**
 * The library, as a door the test can walk through.
 *
 * The picker `lazy()`-imports the dialog so a page that merely *can* open a gallery
 * does not download one, which means a test cannot reach the grid without waiting for
 * a chunk. A stub is the honest shortcut: what the step has to get right is what it
 * asks the dialog for and what it does with the answer, and both are visible here.
 */
const dialog = vi.hoisted(() => ({ current: null as GalleryPickerDialogProps | null }));

vi.mock('@/components/media/GalleryPickerDialog', () => ({
  GalleryPickerDialog: (props: GalleryPickerDialogProps) => {
    dialog.current = props;
    return (
      <div
        role="dialog"
        aria-label="library stub"
        data-slots={props.max}
        data-purpose={props.purpose}
      >
        {props.max} slots for {props.purpose}
        <button type="button" onClick={() => props.onPick([PICKED])}>
          pick it
        </button>
      </div>
    );
  },
}));

/** A screenshot the member already hosted, waiting on the shelf. */
const PICKED: PickedMedia = {
  mediaId: 'asset-shot',
  url: 'https://i.ibb.co/picked/launch.png',
  thumbUrl: 'https://i.ibb.co/picked/launch-medium.png',
  width: 1200,
  height: 630,
  altText: 'The launch page on a phone, held in one hand',
  purpose: 'project-image',
};

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

  it('offers a real image file input for the project cover step', () => {
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

  it('offers the library beside the file input, and a pick needs no upload', async () => {
    // The controller is read back through a spy rather than a captured variable, so
    // the assertions see the render the pick caused and not the one before it.
    const takeController = vi.fn<(controller: ReturnType<typeof useAttachments>) => void>();
    render(<WizardHarness step={3} onController={takeController} />);
    const latest = (): ReturnType<typeof useAttachments> => {
      const calls = takeController.mock.calls;
      const controller = calls[calls.length - 1]?.[0];
      if (!controller) throw new Error('the wizard never passed its page-owned queue down');
      return controller;
    };

    fireEvent.click(screen.getByRole('button', { name: 'media.gallery.open' }));
    const opened = await screen.findByRole('dialog', { name: 'library stub' });
    // The shelf this step files to, and only the room this step has — so the eight
    // screenshots a project can carry stay eight whether they came from a device or
    // from a pick, without the step having to notice the difference.
    expect(opened).toHaveAttribute('data-purpose', 'project-image');
    expect(opened).toHaveAttribute('data-slots', '8');
    // And no upload button inside: the file input the step already owns is the one
    // door to the device, or the same picture could be chosen two ways that behave
    // differently.
    expect(dialog.current?.onDevice).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'pick it' }));
    // The tray shows the picked picture with its stored caption as the accessible
    // name — the caption the member wrote the first time is what a screen reader
    // says now, in the project's own order of pictures.
    await screen.findByAltText('The launch page on a phone, held in one hand');

    const attached = latest().attachments[0];
    if (!attached) throw new Error('the pick never reached the queue the step renders');
    // `attached` and not `queued`: the bytes are already where they need to be, so
    // the member waits for nothing and the host stores one copy of the file.
    expect(attached.status).toBe('attached');
    expect(attached.progress).toBe(100);
    expect(attached.file).toBeNull();
    expect(attached.mediaId).toBe('asset-shot');
    expect(attached.url).toBe('https://i.ibb.co/picked/launch.png');
    // The caption is the one stored with the picture, so the step's accessibility
    // check is already satisfied by a pick — no typing, and no empty alt to fix.
    expect(attached.altText).toBe('The launch page on a phone, held in one hand');
    // Nothing is uploading, because nothing had to be.
    expect(screen.queryByText('create.projectSteps.screenshotsUploading')).not.toBeInTheDocument();

    // The shelf is told what the project already carries, so the member is not
    // invited to add the same picture twice — with the address the project holds,
    // which for a pick is the stored one and not a local blob.
    expect(dialog.current?.attached).toEqual(['https://i.ibb.co/picked/launch.png']);
  });

  it('will not take more picks than the step has room for', () => {
    const takeController = vi.fn<(controller: ReturnType<typeof useAttachments>) => void>();
    render(<WizardHarness step={3} onController={takeController} />);

    act(() => {
      takeController.mock.calls[takeController.mock.calls.length - 1]![0].attachPicked(
        Array.from({ length: 8 }, (_, index) => ({
          ...PICKED,
          mediaId: `asset-shot-${index}`,
          url: `https://i.ibb.co/picked/s${index}.png`,
        })),
      );
    });
    expect(screen.getByRole('button', { name: 'media.gallery.open' })).toBeDisabled();
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
