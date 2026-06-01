// Tailwind class utility: merges conditional classes while resolving duplicate
// Tailwind utilities safely.
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
