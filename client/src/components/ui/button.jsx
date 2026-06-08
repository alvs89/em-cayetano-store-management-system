// Shared button primitive used for primary actions, secondary actions, and icon
// controls across the application.
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
import * as React from "react";
import { Slot } from "@radix-ui/react-slot@1.1.2";
import { cva } from "class-variance-authority@0.7.1";
import { cn } from "./utils";
// Button variants centralize action styling so command buttons stay consistent
// across forms, dialogs, tables, and icon controls.
const buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-sm active:bg-primary/80",
      destructive: "bg-destructive text-white hover:bg-destructive/90 hover:shadow-sm active:bg-destructive/80 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
      outline: "border bg-background text-foreground hover:border-slate-300 hover:bg-slate-100 hover:text-slate-950 active:bg-slate-200 dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:shadow-sm active:bg-secondary/70",
      ghost: "hover:bg-slate-100 hover:text-slate-950 active:bg-slate-200 dark:hover:bg-accent/50",
      link: "text-primary underline-offset-4 hover:underline"
    },
    size: {
      default: "h-9 px-4 py-2 has-[>svg]:px-3",
      sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
      lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
      icon: "size-9 rounded-md"
    }
  },
  defaultVariants: {
    variant: "default",
    size: "default"
  }
});
/**
 * Renders the shared button primitive.
 *
 * @param {object} props - Button props plus variant, size, and asChild options.
 * @param {React.Ref} ref - Forwarded ref for focus management.
 * @returns {React.ReactElement} Button or slotted child with button styling.
 */
const Button = /*#__PURE__*/React.forwardRef(({
  className,
  variant,
  size,
  asChild = false,
  ...props
}, ref) => {
  const Comp = asChild ? Slot : "button";
  return /*#__PURE__*/React.createElement(Comp, _extends({
    "data-slot": "button",
    className: cn(buttonVariants({
      variant,
      size,
      className
    })),
    ref: ref
  }, props));
});
Button.displayName = "Button";
export { Button, buttonVariants };

