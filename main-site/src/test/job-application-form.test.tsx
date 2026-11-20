import type * as ReactI18Next from 'react-i18next';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { JobApplicationSubmission } from '@/lib/opportunities/job-application';
import { JobApplicationForm, type JobApplicationPrefill } from '@/components/jobs/JobApplicationForm';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof ReactI18Next>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

function renderForm(
  initial: JobApplicationPrefill = {},
  onSubmit: (application: JobApplicationSubmission) => Promise<void> = vi.fn().mockResolvedValue(undefined),
) {
  return render(
    <MemoryRouter>
      <JobApplicationForm
        open
        jobTitle="Software Engineer"
        initial={initial}
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    </MemoryRouter>,
  );
}

describe('JobApplicationForm', () => {
  it('prefills profile details and requires a review step before sending', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    renderForm(
      {
        applicantName: 'Nusrat Jahan',
        email: 'nusrat@example.com',
        location: 'Sylhet',
        skills: ['react', 'typescript'],
      },
      submit,
    );

    expect(screen.getByLabelText('jobs.application.name')).toHaveValue('Nusrat Jahan');
    expect(screen.getByLabelText('jobs.application.email')).toHaveValue('nusrat@example.com');
    expect(screen.getByLabelText('jobs.application.location')).toHaveValue('Sylhet');

    fireEvent.change(screen.getByLabelText('jobs.application.phone'), { target: { value: '+880 1712-345678' } });
    fireEvent.change(screen.getByLabelText('jobs.application.expectedSalary'), { target: { value: '45000.50' } });
    fireEvent.change(screen.getByLabelText('jobs.application.resume'), { target: { value: 'https://drive.google.com/file/d/resume/view' } });
    fireEvent.change(screen.getByLabelText('jobs.coverLetter'), {
      target: { value: 'I have shipped reliable applications for several years.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'jobs.application.reviewApplication' }));
    expect(screen.getByText('jobs.application.reviewTitle')).toBeInTheDocument();
    expect(screen.getByText('jobs.application.expectedSalary')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'jobs.application.submit' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        applicantName: 'Nusrat Jahan',
        phone: '+880 1712-345678',
        email: 'nusrat@example.com',
        location: 'Sylhet',
        expectedSalaryPoisha: 4_500_050,
        resumeUrl: 'https://drive.google.com/file/d/resume/view',
        skills: ['react', 'typescript'],
        coverLetter: 'I have shipped reliable applications for several years.',
      }),
    );
    expect(await screen.findByText('jobs.application.successTitle')).toBeInTheDocument();
  });

  it('shows inline validation instead of submitting when contact data is invalid', () => {
    renderForm({ applicantName: 'Nusrat' });
    fireEvent.change(screen.getByLabelText('jobs.application.email'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText('jobs.coverLetter'), { target: { value: 'A valid enough cover letter for this role.' } });
    fireEvent.click(screen.getByRole('button', { name: 'jobs.application.reviewApplication' }));

    expect(screen.getByText('jobs.application.validation.email')).toBeInTheDocument();
    expect(screen.queryByText('jobs.application.validation.contactRequired')).toBeNull();
  });

  it('returns to the editable form and shows a bilingual-mapped error when submission fails', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('data/unknown'));
    renderForm({ applicantName: 'Nusrat', phone: '+880 1712-345678' }, submit);
    fireEvent.change(screen.getByLabelText('jobs.coverLetter'), {
      target: { value: 'I have shipped reliable applications for several years.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'jobs.application.reviewApplication' }));
    fireEvent.click(screen.getByRole('button', { name: 'jobs.application.submit' }));

    expect(await screen.findByText('jobs.application.submitFailed')).toBeInTheDocument();
    expect(screen.getByText('data.errors.generic')).toBeInTheDocument();
    expect(screen.getByLabelText('jobs.application.phone')).toBeInTheDocument();
  });
});
