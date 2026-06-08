// Shared card primitives for repeated panels, summaries, and dialog content.
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
import * as React from "react";
import { cn } from "./utils";
/**
 * Renders the base card container used for panels and grouped content.
 *
 * @param {object} props - Card HTML props.
 * @returns {React.ReactElement} Card container.
 */
function Card({
  className,
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    "data-slot": "card",
    className: cn("bg-card text-card-foreground flex flex-col gap-6 rounded-xl border", className)
  }, props));
}
/**
 * Renders the card header area for titles, descriptions, and actions.
 *
 * @param {object} props - Header HTML props.
 * @returns {React.ReactElement} Card header.
 */
function CardHeader({
  className,
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    "data-slot": "card-header",
    className: cn("@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 pt-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6", className)
  }, props));
}
/**
 * Renders the semantic title inside a card.
 *
 * @param {object} props - Title HTML props.
 * @returns {React.ReactElement} Card title.
 */
function CardTitle({
  className,
  ...props
}) {
  return /*#__PURE__*/React.createElement("h4", _extends({
    "data-slot": "card-title",
    className: cn("leading-none", className)
  }, props));
}
/**
 * Renders supporting text below a card title.
 *
 * @param {object} props - Description HTML props.
 * @returns {React.ReactElement} Card description.
 */
function CardDescription({
  className,
  ...props
}) {
  return /*#__PURE__*/React.createElement("p", _extends({
    "data-slot": "card-description",
    className: cn("text-muted-foreground", className)
  }, props));
}
/**
 * Renders an action slot aligned to the card header.
 *
 * @param {object} props - Action container props.
 * @returns {React.ReactElement} Card action container.
 */
function CardAction({
  className,
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    "data-slot": "card-action",
    className: cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)
  }, props));
}
/**
 * Renders the main body area of a card.
 *
 * @param {object} props - Content HTML props.
 * @returns {React.ReactElement} Card content container.
 */
function CardContent({
  className,
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    "data-slot": "card-content",
    className: cn("px-6 [&:last-child]:pb-6", className)
  }, props));
}
/**
 * Renders the footer area for card actions or summaries.
 *
 * @param {object} props - Footer HTML props.
 * @returns {React.ReactElement} Card footer.
 */
function CardFooter({
  className,
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    "data-slot": "card-footer",
    className: cn("flex items-center px-6 pb-6 [.border-t]:pt-6", className)
  }, props));
}
export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };

