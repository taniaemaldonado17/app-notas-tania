import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert a hex color (#RRGGBB) to an rgba string with the given alpha.
 * Returns the original value if parsing fails.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '')
  if (cleaned.length !== 6) return hex
  const r = parseInt(cleaned.slice(0, 2), 16)
  const g = parseInt(cleaned.slice(2, 4), 16)
  const b = parseInt(cleaned.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return hex
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Format a Date for the es-AR locale, short form.
 */
export function formatDateAR(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}
