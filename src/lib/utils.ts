import { clsx, type ClassValue } from "clsx";
import type { CSSProperties } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "#e11d48" → "225 29 72" (dùng cho CSS var --brand của Tailwind). */
export function hexToRgbTriplet(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "225 29 72";
  return `${parseInt(m[1]!, 16)} ${parseInt(m[2]!, 16)} ${parseInt(m[3]!, 16)}`;
}

export function brandStyle(hex: string) {
  return { "--brand": hexToRgbTriplet(hex) } as CSSProperties;
}
