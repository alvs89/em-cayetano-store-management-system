// Numeric input guards prevent invalid characters before they reach controlled
// form state, while still sanitizing paste, drop, and autofill edge cases.
import { toast } from 'sonner';

export const sanitizeNumericText = (value, mode = 'whole', decimalPlaces = 2) => {
  const rawValue = String(value ?? '');
  if (mode === 'whole') return rawValue.replace(/\D/g, '');

  const cleaned = rawValue.replace(/[^\d.]/g, '');
  const [whole = '', ...decimalParts] = cleaned.split('.');
  if (decimalParts.length === 0) return whole;
  return `${whole}.${decimalParts.join('').slice(0, decimalPlaces)}`;
};

const getSelectionRange = target => ({
  start: target.selectionStart ?? String(target.value || '').length,
  end: target.selectionEnd ?? target.selectionStart ?? String(target.value || '').length,
});

const replaceSelectedText = (target, text) => {
  const value = String(target.value || '');
  const { start, end } = getSelectionRange(target);
  return `${value.slice(0, start)}${text}${value.slice(end)}`;
};

const notifyInvalidNumericInput = ({ mode, fieldName, toastId }) => {
  const message = mode === 'whole'
    ? `${fieldName} accepts whole numbers only.`
    : `${fieldName} accepts numbers and one decimal point only.`;

  toast.warning(message, {
    id: toastId,
    duration: 2400,
  });
};

export const createNumericInputGuards = ({
  mode = 'whole',
  fieldName = 'This field',
  toastId = 'numeric-input-invalid',
  decimalPlaces = 2,
  onBeforeInput,
  onPaste,
  onDrop,
  onChange,
} = {}) => {
  const sanitize = value => sanitizeNumericText(value, mode, decimalPlaces);

  const applySanitizedValue = (event, nextValue) => {
    const sanitized = sanitize(nextValue);
    if (nextValue === sanitized) return false;

    event.preventDefault();
    event.currentTarget.value = sanitized;
    onChange?.(event);
    notifyInvalidNumericInput({ mode, fieldName, toastId });
    return true;
  };

  return {
    onBeforeInput(event) {
      const insertedText = event.data ?? event.nativeEvent?.data ?? '';
      if (!insertedText) {
        onBeforeInput?.(event);
        return;
      }

      if (applySanitizedValue(event, replaceSelectedText(event.currentTarget, insertedText))) return;
      onBeforeInput?.(event);
    },
    onPaste(event) {
      const pastedText = event.clipboardData?.getData('text') || '';
      if (applySanitizedValue(event, replaceSelectedText(event.currentTarget, pastedText))) return;
      onPaste?.(event);
    },
    onDrop(event) {
      const droppedText = event.dataTransfer?.getData('text') || '';
      if (applySanitizedValue(event, replaceSelectedText(event.currentTarget, droppedText))) return;
      onDrop?.(event);
    },
    onChange(event) {
      const sanitized = sanitize(event.currentTarget.value);
      if (event.currentTarget.value !== sanitized) {
        event.currentTarget.value = sanitized;
        notifyInvalidNumericInput({ mode, fieldName, toastId });
      }

      onChange?.(event);
    },
  };
};
