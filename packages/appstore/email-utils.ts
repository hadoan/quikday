/**
 * Base email utilities for formatting and processing emails
 * Used by email integrations (Gmail, Outlook, etc.)
 */

export interface EmailFormatOptions {
  includeSignature?: boolean;
  signature?: string;
}

/**
 * Format email body with optional signature
 */
export function formatEmailBody(body: string, options: EmailFormatOptions = {}): string {
  if (!options.includeSignature || !options.signature) {
    return body;
  }

  return `${body}\n\n--\n${options.signature}`;
}

/**
 * Sanitize HTML content for email
 */
export function sanitizeHtmlForEmail(html: string): string {
  // Basic sanitization - in production, use a proper library like DOMPurify
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
}

/**
 * Convert plain text to basic HTML
 */
export function textToHtml(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<br>'))
    .join('');
}

/**
 * Escape HTML entities
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

/**
 * Generate email preview/summary
 */
export function generateEmailSummary(
  to: string,
  subject: string,
  bodyPreview: string = '',
  maxLength: number = 100,
): string {
  const preview =
    bodyPreview.length > maxLength ? `${bodyPreview.substring(0, maxLength)}...` : bodyPreview;

  return `📧 Email to ${to}\nSubject: ${subject}\n${preview ? `Preview: ${preview}` : ''}`;
}

