import { describe, expect, it } from 'vitest';
import { mapJobApplication, mapMyJobApplication } from './opportunity-repository';
import type { JobApplicationRow, MyJobApplicationRow } from '@/lib/supabase/types';

const employerRow: JobApplicationRow = {
  id: 'app-1',
  job_id: 'job-1',
  applicant_uid: 'member-1',
  applicant_name: 'Nusrat Jahan',
  username: 'nusrat',
  display_name: 'Profile display name',
  avatar_url: 'https://i.ibb.co/a/avatar.png',
  verified: false,
  phone: '+880 1712-345678',
  email: 'nusrat@example.com',
  location: 'Sylhet',
  years_experience: 5,
  education: 'BSc',
  expected_salary_poisha: 12_500_000,
  portfolio_url: 'https://nusrat.example.com/work',
  linkedin_url: 'https://www.linkedin.com/in/nusrat',
  notice_period: '30 days',
  skills: [' Firebase ', 'Kotlin', 'firebase'],
  certification_image_urls: ['https://i.ibb.co/a/cert.png', 'https://evil.example/cert.png'],
  cover_letter: 'I have shipped reliable applications.',
  resume_url: 'https://drive.google.com/file/d/resume/view',
  status: 'submitted',
  rejection_reason: '',
  decided_at: null,
  created_at: '2026-11-10T00:00:00Z',
};

const mineRow: MyJobApplicationRow = {
  id: 'app-2',
  job_id: 'job-2',
  job_slug: 'engineer',
  job_title: 'Engineer',
  company: 'BSDC',
  job_status: 'open',
  expires_at: null,
  applicant_name: 'Nusrat Jahan',
  cover_letter: 'I have shipped reliable applications.',
  resume_url: 'https://drive.google.com/file/d/resume/view',
  portfolio_url: 'https://nusrat.example.com/work',
  linkedin_url: 'https://www.linkedin.com/in/nusrat',
  location: 'Sylhet',
  years_experience: 5,
  education: 'BSc',
  expected_salary_poisha: 12_500_000,
  notice_period: '30 days',
  skills: ['Kotlin', 'React'],
  certification_image_urls: ['https://i7.ibb.co.com/a/cert.png'],
  status: 'reviewing',
  rejection_reason: '',
  decided_at: null,
  created_at: '2026-11-10T00:00:00Z',
};

describe('application RPC row mapping', () => {
  it('maps complete queue details, normalises skills and removes unsafe image links', () => {
    expect(mapJobApplication(employerRow)).toMatchObject({
      applicantName: 'Nusrat Jahan',
      displayName: 'Profile display name',
      phone: '+880 1712-345678',
      email: 'nusrat@example.com',
      expectedSalaryPoisha: 12_500_000,
      resumeUrl: 'https://drive.google.com/file/d/resume/view',
      portfolioUrl: 'https://nusrat.example.com/work',
      skills: ['firebase', 'kotlin'],
      certificationImageUrls: ['https://i.ibb.co/a/cert.png'],
    });
  });

  it('falls back to the profile display name and strips non-HTTPS application actions', () => {
    const result = mapJobApplication({
      ...employerRow,
      applicant_name: '',
      display_name: 'Profile name',
      resume_url: 'javascript:alert(1)',
      portfolio_url: 'http://bad.example',
      linkedin_url: 'data:text/html,unsafe',
    });
    expect(result.applicantName).toBe('Profile name');
    expect(result.resumeUrl).toBe('');
    expect(result.portfolioUrl).toBe('');
    expect(result.linkedinUrl).toBe('');
  });

  it('maps the applicant tracker without adding employer contact fields', () => {
    const application = mapMyJobApplication(mineRow);
    expect(application).toMatchObject({
      jobTitle: 'Engineer',
      status: 'reviewing',
      expectedSalaryPoisha: 12_500_000,
      resumeUrl: 'https://drive.google.com/file/d/resume/view',
      certificationImageUrls: ['https://i7.ibb.co.com/a/cert.png'],
    });
    expect(application).not.toHaveProperty('phone');
    expect(application).not.toHaveProperty('email');
  });
});
