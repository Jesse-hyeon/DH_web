import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const forbiddenAdminMarker = ['firebase', 'admin'].join('-');

describe('Firestore MVP rules contract', () => {
  it('uses only the service-scoped attendance path and no privileged/auth escape hatch', () => {
    expect(rules).toContain('match /attendanceServices/{serviceKey}/submissions/{submissionId}');
    expect(rules).not.toContain('match /attendanceSubmissions/{submissionId}');
    expect(rules).not.toMatch(/match \/attendance\//);
    expect(rules).not.toMatch(/match \/\{document=\*\*\}/);
    expect(rules).not.toContain(forbiddenAdminMarker);
    expect(rules).not.toContain(['admin', 'auth'].join('.'));
    expect(rules).not.toContain(['request', 'auth'].join('.'));
  });

  it('enforces exact public member fields and allowlist snapshot validation', () => {
    expect(rules).toContain("data.keys().hasOnly(['memberId', 'displayLabel', 'searchName', 'sortKey'])");
    expect(rules).toContain('data.memberId == memberId');
    expect(rules).toContain('memberDocument(request.resource.data.memberId).displayLabel');
    expect(rules).not.toContain('allowAttendanceSubmission');
  });

  it('requires server timestamp, current service, canonical date format, and exact attendance fields', () => {
    expect(rules).toContain('request.resource.data.submittedAt == request.time');
    expect(rules).toContain("request.resource.data.serviceKey.matches('^\\\\d{4}-\\\\d{2}-\\\\d{2}$')");
    expect(rules).toContain('serviceKey == currentServiceKey()');
    expect(rules).toContain('request.resource.data.serviceKey == serviceKey');
    expect(rules).toContain("request.resource.data.keys().hasOnly([\n          'memberId',\n          'displayNameSnapshot',\n          'serviceKey',\n          'submittedAt',\n          'createdAtClient',");
    expect(rules).toContain('allow update, delete: if false;');
  });

  it('bounds member and attendance list queries while preserving direct get validation', () => {
    expect(rules).toContain('allow get: if isPublicMember(memberId, resource.data);');
    expect(rules).toContain('request.query.limit <= 2000');
    expect(rules).toContain('allow get: if serviceKey == currentServiceKey()');
    expect(rules).toContain('request.query.limit <= 100');
    expect(rules).toContain('request.query.limit != null');
    expect(rules).not.toContain('allow list: if request.query.limit != null\n        && request.query.limit <= 2000\n        && isPublicMember');
    expect(rules).not.toContain('request.query.limit <= 100\n        && resource.data.serviceKey == serviceKey');
  });
});
