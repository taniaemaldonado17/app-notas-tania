'use client'

/**
 * Client-side helper that triggers the server-side template seed
 * for the authenticated user (idempotent). Called on workspace mount.
 */
export async function ensureTemplatePageClient(): Promise<void> {
  try {
    await fetch('/api/seed', { method: 'GET' })
  } catch {
    // Not fatal: registration already calls ensureTemplatePage on the server.
  }
}
