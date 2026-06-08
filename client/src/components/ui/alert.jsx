// Shared alert primitives used to present status, warning, and informational
// messages with consistent styling.
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
import * as React from "react";
import { cva } from "class-variance-authority@0.7.1";
import { cn } from "./utils";
// Alert variants keep warning and informational messages visually consistent.
const alertVariants = cva("relative w-full overflow-hidden rounded-2xl border border-gray-200/90 bg-white/90 px-4 py-4 text-sm shadow-lg backdrop-blur-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-1 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-gradient-to-b before:from-[#FFFF00] before:to-[#FF0000]", {
  variants: {
    variant: {
      default: "text-gray-900",
      destructive: "text-destructive bg-white [&>svg]:text-destructive *:data-[slot=alert-description]:text-destructive/90 before:from-[#FF0000] before:to-[#b30000]"
    }
  },
  defaultVariants: {
    variant: "default"
  }
});
/**
 * Renders a status or warning alert container.
 *
 * @param {object} props - Alert props plus optional variant.
 * @returns {React.ReactElement} Alert container.
 */
function Alert({
  className,
  variant,
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    "data-slot": "alert",
    role: "alert",
    className: cn(alertVariants({
      variant
    }), className)
  }, props));
}
/**
 * Renders the title area of an alert.
 *
 * @param {object} props - Alert title props.
 * @returns {React.ReactElement} Alert title.
 */
function AlertTitle({
  className,
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    "data-slot": "alert-title",
    className: cn("col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight", className)
  }, props));
}
/**
 * Renders supporting alert text.
 *
 * @param {object} props - Alert description props.
 * @returns {React.ReactElement} Alert description.
 */
function AlertDescription({
  className,
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    "data-slot": "alert-description",
    className: cn("text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed", className)
  }, props));
}
export { Alert, AlertTitle, AlertDescription };

