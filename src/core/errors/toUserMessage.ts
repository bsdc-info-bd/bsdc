/**
 * BSDC — src/core/errors/toUserMessage.ts
 * Purpose : Maps any error to a bilingual, actionable user message (PART 24.2, PART 09.02).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : This is the ONLY place that decides what a member reads when something fails. No
 *           component may invent an error string.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { AppError } from './AppError';
import { findError } from './taxonomy';

/** A message ready to render: what happened, why, the next action and the code. */
export interface UserMessage {
  readonly titleBn: string;
  readonly titleEn: string;
  readonly bodyBn: string;
  readonly bodyEn: string;
  readonly code: string;
  readonly retryable: boolean;
}

/**
 * Converts an unknown error into a user-facing message.
 * @param error thrown value
 * @param locale target locale
 * @returns a bilingual, actionable message with its support code
 */
export function toUserMessage(error: unknown, locale: 'bn' | 'en' = 'bn'): UserMessage {
  const appError = error instanceof AppError ? error : new AppError('BSDC-APP-001', {}, error);
  const definition = findError(appError.code);
  const titleBn = definition ? 'কিছু একটিতে সমস্যা হয়েছে' : 'কিছু একটিতে সমস্যা হয়েছে';
  const titleEn = definition ? 'Something went wrong' : 'Something went wrong';
  const bodyBn = definition?.bn ?? appError.messageBn();
  const bodyEn = definition?.en ?? appError.message;
  return {
    titleBn: locale === 'bn' ? titleBn : titleEn,
    titleEn,
    bodyBn,
    bodyEn,
    code: appError.code,
    retryable: appError.retryable,
  };
}
