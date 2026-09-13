import { describe, expect, it } from 'vitest';

import { getAuditContext } from './audit';

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request('https://example.com/api/admin/categories', { headers });
}

describe('getAuditContext', () => {
  it('extracts the first IP from a comma-separated x-forwarded-for', () => {
    const request = requestWithHeaders({ 'x-forwarded-for': '203.0.113.5, 70.41.3.18' });
    expect(getAuditContext(request).ipAddress).toBe('203.0.113.5');
  });

  it('trims whitespace around the candidate IP', () => {
    const request = requestWithHeaders({ 'x-forwarded-for': '  203.0.113.5  , 70.41.3.18' });
    expect(getAuditContext(request).ipAddress).toBe('203.0.113.5');
  });

  it('accepts a valid IPv6 address', () => {
    const request = requestWithHeaders({ 'x-forwarded-for': '2001:db8::1' });
    expect(getAuditContext(request).ipAddress).toBe('2001:db8::1');
  });

  it('returns null when x-forwarded-for is not a valid IP', () => {
    const request = requestWithHeaders({ 'x-forwarded-for': 'not-an-ip' });
    expect(getAuditContext(request).ipAddress).toBeNull();
  });

  it('returns null when x-forwarded-for header is absent', () => {
    const request = requestWithHeaders({});
    expect(getAuditContext(request).ipAddress).toBeNull();
  });

  it('returns the user-agent as-is when under the length limit', () => {
    const request = requestWithHeaders({ 'user-agent': 'Mozilla/5.0 Test' });
    expect(getAuditContext(request).userAgent).toBe('Mozilla/5.0 Test');
  });

  it('truncates the user-agent to 512 characters', () => {
    const longUserAgent = 'A'.repeat(600);
    const request = requestWithHeaders({ 'user-agent': longUserAgent });
    const context = getAuditContext(request);
    expect(context.userAgent).toHaveLength(512);
    expect(context.userAgent).toBe('A'.repeat(512));
  });

  it('returns null user-agent when the header is absent', () => {
    const request = requestWithHeaders({});
    expect(getAuditContext(request).userAgent).toBeNull();
  });
});
