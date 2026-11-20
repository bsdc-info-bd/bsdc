import { isRepairableMediaHost } from '@/lib/media/hosts';
import { normaliseSkills } from './skills';

/** Editable application snapshot; all text remains in the existing database row. */
export interface JobApplicationDraft {
  applicantName: string;
  phone: string;
  email: string;
  location: string;
  yearsExperience: string;
  education: string;
  expectedSalaryTaka: string;
  portfolioUrl: string;
  linkedinUrl: string;
  noticePeriod: string;
  skills: string[];
  certificationImageUrls: string[];
  coverLetter: string;
  resumeUrl: string;
}

export interface JobApplicationSubmission {
  applicantName: string;
  phone: string;
  email: string;
  location: string;
  yearsExperience: number | null;
  education: string;
  expectedSalaryPoisha: number | null;
  portfolioUrl: string;
  linkedinUrl: string;
  noticePeriod: string;
  skills: string[];
  certificationImageUrls: string[];
  coverLetter: string;
  resumeUrl: string;
}

export type JobApplicationValidationErrors = Partial<Record<keyof JobApplicationDraft | 'contact', string>>;

/** Optional phone, restricted to the database's digits/+ /space/dash contract. */
export function isValidApplicationPhone(raw: string): boolean {
  const value = raw.trim();
  return value.length === 0 || (value.length <= 20 && /^[0-9+ -]+$/.test(value) && /[0-9]/.test(value));
}

/** Optional email, checked before it reaches the RPC (the database checks again). */
export function isValidApplicationEmail(raw: string): boolean {
  const value = raw.trim();
  if (value.length === 0) return true;
  if (value.length > 320) return false;
  return /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(
    value,
  );
}

/** Only absolute HTTPS URLs without credentials are accepted for applicant links. */
export function isValidApplicationHttpsUrl(raw: string): boolean {
  const value = raw.trim();
  if (value.length === 0) return true;
  if (/[\s<>]/.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname.length > 0 &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}

/** ImgBB-only link validation, using the platform's shared exact host allowlist. */
export function isValidApplicationImgBbUrl(raw: string): boolean {
  const value = raw.trim();
  if (value.length === 0) return true;
  if (/[\s<>]/.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      isRepairableMediaHost(url.hostname)
    );
  } catch {
    return false;
  }
}

/** Convert a non-negative taka string (up to two decimals) to exact poisha. */
export function takaToPoisha(raw: string): number | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  const match = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  try {
    const whole = BigInt(match[1] ?? '0');
    const fractional = BigInt((match[2] ?? '').padEnd(2, '0') || '0');
    const poisha = whole * 100n + fractional;
    if (poisha > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(poisha);
  } catch {
    return null;
  }
}

/** Returns field-to-translation-key errors for the whole application form. */
export function validateJobApplicationDraft(
  draft: JobApplicationDraft,
): JobApplicationValidationErrors {
  const errors: JobApplicationValidationErrors = {};
  const coverLetterLength = draft.coverLetter.trim().length;
  if (coverLetterLength < 20 || coverLetterLength > 6000) {
    errors.coverLetter = 'jobs.application.validation.coverLetter';
  }
  if (draft.applicantName.trim().length === 0 || draft.applicantName.trim().length > 60) {
    errors.applicantName = 'jobs.application.validation.name';
  }
  if (!isValidApplicationPhone(draft.phone)) errors.phone = 'jobs.application.validation.phone';
  if (!isValidApplicationEmail(draft.email)) errors.email = 'jobs.application.validation.email';
  if (draft.phone.trim().length === 0 && draft.email.trim().length === 0) {
    errors.contact = 'jobs.application.validation.contactRequired';
  }
  if (draft.location.trim().length > 80) errors.location = 'jobs.application.validation.location';
  if (
    draft.yearsExperience.trim().length > 0 &&
    (!/^\d{1,2}$/.test(draft.yearsExperience.trim()) ||
      Number(draft.yearsExperience) < 0 ||
      Number(draft.yearsExperience) > 60)
  ) {
    errors.yearsExperience = 'jobs.application.validation.experience';
  }
  if (draft.education.trim().length > 200) errors.education = 'jobs.application.validation.education';
  if (draft.expectedSalaryTaka.trim().length > 0 && takaToPoisha(draft.expectedSalaryTaka) === null) {
    errors.expectedSalaryTaka = 'jobs.application.validation.salary';
  }
  if (!isValidApplicationHttpsUrl(draft.resumeUrl)) errors.resumeUrl = 'jobs.application.validation.url';
  if (!isValidApplicationHttpsUrl(draft.portfolioUrl)) errors.portfolioUrl = 'jobs.application.validation.url';
  if (!isValidApplicationHttpsUrl(draft.linkedinUrl)) errors.linkedinUrl = 'jobs.application.validation.url';
  if (draft.noticePeriod.trim().length > 60) errors.noticePeriod = 'jobs.application.validation.notice';
  if (draft.skills.length > 30 || draft.skills.some((skill) => skill.trim().length === 0 || skill.trim().length > 64)) {
    errors.skills = 'jobs.application.validation.skills';
  }
  const imageUrls = draft.certificationImageUrls.map((url) => url.trim()).filter(Boolean);
  if (imageUrls.length > 3 || imageUrls.some((url) => !isValidApplicationImgBbUrl(url))) {
    errors.certificationImageUrls = 'jobs.application.validation.image';
  }
  return errors;
}

export function toJobApplicationSubmission(draft: JobApplicationDraft): JobApplicationSubmission {
  return {
    applicantName: draft.applicantName.trim(),
    phone: draft.phone.trim(),
    email: draft.email.trim().toLowerCase(),
    location: draft.location.trim(),
    yearsExperience: draft.yearsExperience.trim() ? Number(draft.yearsExperience) : null,
    education: draft.education.trim(),
    expectedSalaryPoisha: takaToPoisha(draft.expectedSalaryTaka),
    portfolioUrl: draft.portfolioUrl.trim(),
    linkedinUrl: draft.linkedinUrl.trim(),
    noticePeriod: draft.noticePeriod.trim(),
    skills: normaliseSkills(draft.skills).slice(0, 30),
    certificationImageUrls: draft.certificationImageUrls.map((url) => url.trim()).filter(Boolean),
    coverLetter: draft.coverLetter.trim(),
    resumeUrl: draft.resumeUrl.trim(),
  };
}
