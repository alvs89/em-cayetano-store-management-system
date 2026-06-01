// Verification-code helpers provide consistent numeric OTP input behavior and
// validation feedback across authentication screens.
import { toast } from 'sonner';

export const VERIFICATION_CODE_LENGTH = 6;
export const VERIFICATION_CODE_NUMERIC_MESSAGE = 'Only numbers are allowed for the verification code.';

const toastClassNames = {
  toast: 'rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900',
};

// Verification codes are always numeric; sanitizing in one helper keeps OTP
// fields consistent across login, password reset, and future verification flows.
export function sanitizeVerificationCode(value, maxLength = VERIFICATION_CODE_LENGTH) {
  return String(value || '').replace(/\D/g, '').slice(0, maxLength);
}

export function showVerificationCodeNumericToast(id = 'verification-code-numeric-only') {
  toast.error(VERIFICATION_CODE_NUMERIC_MESSAGE, {
    id,
    classNames: toastClassNames,
  });
}

export function handleVerificationCodeChange(value, setValue, {
  maxLength = VERIFICATION_CODE_LENGTH,
  toastId,
} = {}) {
  const nextValue = sanitizeVerificationCode(value, maxLength);

  if (/\D/.test(String(value || ''))) {
    showVerificationCodeNumericToast(toastId);
  }

  setValue(nextValue);
}

export function handleVerificationCodePaste(event, currentValue, setValue, {
  maxLength = VERIFICATION_CODE_LENGTH,
  toastId,
} = {}) {
  const pastedText = event.clipboardData?.getData('text') || '';
  const pastedDigits = pastedText.replace(/\D/g, '');

  if (pastedDigits !== pastedText) {
    showVerificationCodeNumericToast(toastId);
  }

  event.preventDefault();

  // Preserve the user's selected range when pasting, then sanitize the combined
  // value so partial replacements behave like a normal text input.
  const input = event.currentTarget;
  const selectionStart = input.selectionStart ?? String(currentValue || '').length;
  const selectionEnd = input.selectionEnd ?? selectionStart;
  const nextRawValue = `${String(currentValue || '').slice(0, selectionStart)}${pastedDigits}${String(currentValue || '').slice(selectionEnd)}`;

  setValue(sanitizeVerificationCode(nextRawValue, maxLength));
}
