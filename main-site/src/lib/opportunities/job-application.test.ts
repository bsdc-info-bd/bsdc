import { describe, expect, it } from 'vitest';
import {
  isValidApplicationEmail,
  isValidApplicationHttpsUrl,
  isValidApplicationImgBbUrl,
  isValidApplicationPhone,
  takaToPoisha,
  toJobApplicationSubmission,
  validateJobApplicationDraft,
  type JobApplicationDraft,
} from './job-application';

const emptyDraft: JobApplicationDraft = {
  applicantName: 'Nusrat Jahan',
  phone: '+880 1712-345678',
  email: '',
  location: 'Sylhet',
  yearsExperience: '',
  education: '',
  expectedSalaryTaka: '',
  portfolioUrl: '',
  linkedinUrl: '',
  noticePeriod: '',
  skills: [],
  certificationImageUrls: [],
  coverLetter: 'I have shipped accessible production applications.',
  resumeUrl: '',
};

describe('job application validation and mapping', () => {
  it('accepts absolute HTTPS resume links with path, query and fragment', () => {
    expect(isValidApplicationHttpsUrl('https://drive.google.com/file/d/resume/view')).toBe(true);
    expect(isValidApplicationHttpsUrl('https://example.com/cv?download=1#page-2')).toBe(true);
    expect(isValidApplicationHttpsUrl('')).toBe(true);
    expect(isValidApplicationHttpsUrl(' javascript:alert(1) ')).toBe(false);
    expect(isValidApplicationHttpsUrl('http://example.com/cv')).toBe(false);
    expect(isValidApplicationHttpsUrl('https://user:secret@example.com/cv')).toBe(false);
    expect(isValidApplicationHttpsUrl('https://example.com/a b')).toBe(false);
  });

  it('uses only the platform ImgBB host allowlist for certification images', () => {
    expect(isValidApplicationImgBbUrl('https://i.ibb.co/AbCdEf/certificate.png')).toBe(true);
    expect(isValidApplicationImgBbUrl('https://i7.ibb.co.com/a/certificate.webp')).toBe(true);
    expect(isValidApplicationImgBbUrl('https://evil.example/certificate.png')).toBe(false);
    expect(isValidApplicationImgBbUrl('http://i.ibb.co/a/certificate.png')).toBe(false);
    expect(isValidApplicationImgBbUrl('https://i.ibb.co/a/certificate image.png')).toBe(false);
  });

  it('validates contact email and phone values against the database contract', () => {
    expect(isValidApplicationEmail('nusrat@example.com')).toBe(true);
    expect(isValidApplicationEmail('')).toBe(true);
    expect(isValidApplicationEmail('not-an-email')).toBe(false);
    expect(isValidApplicationPhone('+880 1712-345678')).toBe(true);
    expect(isValidApplicationPhone('')).toBe(true);
    expect(isValidApplicationPhone('call 01712')).toBe(false);
  });

  it('converts taka to integer poisha without rounding', () => {
    expect(takaToPoisha('45000')).toBe(4_500_000);
    expect(takaToPoisha('45000.5')).toBe(4_500_050);
    expect(takaToPoisha('0.01')).toBe(1);
    expect(takaToPoisha('')).toBeNull();
    expect(takaToPoisha('45000.501')).toBeNull();
    expect(takaToPoisha('-1')).toBeNull();
    expect(takaToPoisha('999999999999999.99')).toBeNull();
  });

  it('requires a name, one contact method and a useful cover letter', () => {
    expect(validateJobApplicationDraft(emptyDraft)).toEqual({});
    const errors = validateJobApplicationDraft({
      ...emptyDraft,
      applicantName: '',
      phone: '',
      coverLetter: 'short',
    });
    expect(errors).toMatchObject({
      applicantName: 'jobs.application.validation.name',
      contact: 'jobs.application.validation.contactRequired',
      coverLetter: 'jobs.application.validation.coverLetter',
    });
  });

  it('rejects invalid data, excessive skills and more than three image links', () => {
    const errors = validateJobApplicationDraft({
      ...emptyDraft,
      phone: 'call me',
      email: 'broken',
      yearsExperience: '61',
      expectedSalaryTaka: '12.345',
      resumeUrl: 'javascript:alert(1)',
      certificationImageUrls: [
        'https://i.ibb.co/a/one.png',
        'https://i.ibb.co/a/two.png',
        'https://i.ibb.co/a/three.png',
        'https://i.ibb.co/a/four.png',
      ],
    });
    expect(errors).toMatchObject({
      phone: 'jobs.application.validation.phone',
      email: 'jobs.application.validation.email',
      yearsExperience: 'jobs.application.validation.experience',
      expectedSalaryTaka: 'jobs.application.validation.salary',
      resumeUrl: 'jobs.application.validation.url',
      certificationImageUrls: 'jobs.application.validation.image',
    });
  });

  it('maps form strings into clean RPC values and normalises skills', () => {
    const result = toJobApplicationSubmission({
      ...emptyDraft,
      applicantName: ' Nusrat Jahan ',
      phone: ' +880 1712-345678 ',
      email: 'Nusrat@Example.com',
      expectedSalaryTaka: '45000.50',
      skills: [' Kotlin ', 'React', 'kotlin'],
      certificationImageUrls: ['', 'https://i.ibb.co/a/certificate.png'],
      resumeUrl: ' https://example.com/resume.pdf ',
    });
    expect(result).toMatchObject({
      applicantName: 'Nusrat Jahan',
      phone: '+880 1712-345678',
      email: 'nusrat@example.com',
      expectedSalaryPoisha: 4_500_050,
      skills: ['kotlin', 'react'],
      certificationImageUrls: ['https://i.ibb.co/a/certificate.png'],
      resumeUrl: 'https://example.com/resume.pdf',
    });
  });
});
