// Fields the recorder must never capture: passwords, payment and one-time-code
// inputs, CAPTCHAs. Refusal happens at record time so nothing sensitive is
// ever written to SQLite, even by accident.

export interface FieldInfo {
  tag?: string;
  inputType?: string;
  name?: string;
  id?: string;
  autocomplete?: string;
  label?: string;
}

export class RefusedFieldError extends Error {
  constructor(public readonly why: string) {
    super(`Refusing to record this field: ${why}. Logins, passwords, payment details and CAPTCHAs are never automated.`);
    this.name = 'RefusedFieldError';
  }
}

const SENSITIVE_AUTOCOMPLETE = /^(current-password|new-password|one-time-code|cc-|cc$)/i;
const SENSITIVE_WORDS = /\b(password|passcode|passwd|pwd|card number|credit card|cvv|cvc|security code|captcha|one[- ]time code|otp)\b/i;

/** Returns the reason a field is sensitive, or undefined when it is fine to record. */
export function sensitiveReason(f: FieldInfo): string | undefined {
  if ((f.inputType ?? '').toLowerCase() === 'password') return 'type="password" field';
  if (SENSITIVE_AUTOCOMPLETE.test(f.autocomplete ?? '')) return `autocomplete="${f.autocomplete}"`;
  const text = [f.name, f.id, f.label].filter(Boolean).join(' ');
  if (SENSITIVE_WORDS.test(text.replace(/[_-]/g, ' '))) return `field name or label looks like a credential or payment field (${text.trim()})`;
  return undefined;
}

export function assertRecordable(f: FieldInfo): void {
  const why = sensitiveReason(f);
  if (why) throw new RefusedFieldError(why);
}
