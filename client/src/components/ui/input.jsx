// Shared input primitive that standardizes text-field sizing, borders, and
// focus states across forms.
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
import * as React from "react";
import { toast } from "sonner";
import { cn } from "./utils";

const getNumericMode = (inputMode, numericMode) => {
  if (numericMode === "whole" || numericMode === "decimal") return numericMode;
  if (inputMode === "numeric") return "whole";
  if (inputMode === "decimal") return "decimal";
  return null;
};

const getSelectionRange = target => ({
  start: target.selectionStart ?? String(target.value || "").length,
  end: target.selectionEnd ?? target.selectionStart ?? String(target.value || "").length
});

const replaceSelectedText = (target, text) => {
  const value = String(target.value || "");
  const { start, end } = getSelectionRange(target);
  return `${value.slice(0, start)}${text}${value.slice(end)}`;
};

const sanitizeNumericValue = (value, mode, decimalPlaces = 2) => {
  const rawValue = String(value ?? "");
  if (mode === "whole") return rawValue.replace(/\D/g, "");

  const cleaned = rawValue.replace(/[^\d.]/g, "");
  const [whole = "", ...decimalParts] = cleaned.split(".");
  if (decimalParts.length === 0) return whole;
  return `${whole}.${decimalParts.join("").slice(0, decimalPlaces)}`;
};

const getNumericMessage = (mode, label) => (
  mode === "whole"
    ? `${label} accepts whole numbers only.`
    : `${label} accepts numbers and one decimal point only.`
);

const humanizeIdentifier = value => {
  const label = String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
  return label || "This field";
};

const notifyNumericInputBlocked = (mode, label, toastId) => {
  toast.warning(getNumericMessage(mode, label), {
    id: toastId,
    duration: 2400
  });
};

function Input({
  className,
  type,
  inputMode,
  onBeforeInput,
  onChange,
  onClick,
  onPaste,
  onDrop,
  "data-numeric-mode": numericMode,
  "data-validation-label": validationLabel,
  "data-decimal-places": decimalPlaces = 2,
  ...props
}) {
  const activeNumericMode = getNumericMode(inputMode, numericMode);
  const numericLabel = validationLabel || props["aria-label"] || humanizeIdentifier(props.id || props.name);
  const numericToastId = `${props.id || props.name || "numeric-input"}-${activeNumericMode || "value"}-invalid`;

  const handleBeforeInput = event => {
    if (!activeNumericMode) {
      onBeforeInput?.(event);
      return;
    }

    const insertedText = event.data ?? event.nativeEvent?.data ?? "";
    if (!insertedText) {
      onBeforeInput?.(event);
      return;
    }

    const candidate = replaceSelectedText(event.currentTarget, insertedText);
    if (candidate !== sanitizeNumericValue(candidate, activeNumericMode, Number(decimalPlaces))) {
      event.preventDefault();
      notifyNumericInputBlocked(activeNumericMode, numericLabel, numericToastId);
      return;
    }

    onBeforeInput?.(event);
  };

  const applySanitizedInsertedText = (event, insertedText) => {
    if (!activeNumericMode) return false;

    const target = event.currentTarget;
    const candidate = replaceSelectedText(target, insertedText);
    const sanitized = sanitizeNumericValue(candidate, activeNumericMode, Number(decimalPlaces));
    if (candidate === sanitized) return false;

    event.preventDefault();
    target.value = sanitized;
    onChange?.(event);
    notifyNumericInputBlocked(activeNumericMode, numericLabel, numericToastId);
    return true;
  };

  const handlePaste = event => {
    const pastedText = event.clipboardData?.getData("text") || "";
    if (applySanitizedInsertedText(event, pastedText)) return;
    onPaste?.(event);
  };

  const handleDrop = event => {
    const droppedText = event.dataTransfer?.getData("text") || "";
    if (applySanitizedInsertedText(event, droppedText)) return;
    onDrop?.(event);
  };

  const handleChange = event => {
    if (activeNumericMode) {
      const sanitized = sanitizeNumericValue(event.currentTarget.value, activeNumericMode, Number(decimalPlaces));
      if (event.currentTarget.value !== sanitized) {
        event.currentTarget.value = sanitized;
        notifyNumericInputBlocked(activeNumericMode, numericLabel, numericToastId);
      }
    }

    onChange?.(event);
  };

  const handleClick = event => {
    onClick?.(event);
    if (event.defaultPrevented || type !== "date" || event.currentTarget.disabled || event.currentTarget.readOnly) {
      return;
    }
    try {
      event.currentTarget.showPicker?.();
    } catch {
      // Browsers may block showPicker outside trusted interactions; native focus remains available.
    }
  };

  return /*#__PURE__*/React.createElement("input", _extends({
    type: type,
    inputMode: inputMode,
    "data-slot": "input",
    onBeforeInput: handleBeforeInput,
    onClick: handleClick,
    onChange: handleChange,
    onPaste: handlePaste,
    onDrop: handleDrop,
    className: cn("file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base bg-input-background transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm", "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]", "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive", type === "date" && "cursor-pointer hover:border-amber-400 hover:bg-white", className)
  }, props));
}
export { Input };

