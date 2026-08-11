import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_SUBMISSION_ALLOWED_FIELDS,
  COLLECTIONS,
  CURRENT_SERVICE_KEY_DOCUMENT,
  createFirestoreRepository,
  hasExactAttendanceSubmissionFields,
  parsePublicMember,
  parseServiceConfig,
  toAttendanceSubmissionCreate,
  validateAttendanceSubmissionDraft,
  type FirestoreDocumentSnapshot,
  type FirestoreLike,
} from './firestoreRepository';

describe('firestoreRepository helpers', () => {
  it('exports the Firestore collection contract', () => {
    expect(COLLECTIONS).toEqual({
      members: 'members',
      serviceConfig: 'serviceConfig',
      serviceSessions: 'serviceSessions',
      attendanceServices: 'attendanceServices',
      attendanceSubmissions: 'submissions',
    });
    expect(CURRENT_SERVICE_KEY_DOCUMENT).toBe('currentServiceKey');
    expect(ATTENDANCE_SUBMISSION_ALLOWED_FIELDS).toEqual([
      'memberId',
      'displayNameSnapshot',
      'serviceKey',
      'servicePart',
      'submittedAt',
      'createdAtClient',
    ]);
  });

  it('validates exact attendance submission fields', () => {
    expect(
      hasExactAttendanceSubmissionFields({
        memberId: 'm1',
        displayNameSnapshot: 'Member One',
        serviceKey: 'service-1',
        servicePart: 1,
        submittedAt: {},
      }),
    ).toBe(true);

    expect(
      hasExactAttendanceSubmissionFields({
        memberId: 'm1',
        displayNameSnapshot: 'Member One',
        serviceKey: 'service-1',
        servicePart: 1,
        submittedAt: {},
        createdAtClient: new Date(),
      }),
    ).toBe(true);

    expect(
      hasExactAttendanceSubmissionFields({
        memberId: 'm1',
        displayNameSnapshot: 'Member One',
        serviceKey: 'service-1',
        servicePart: 1,
      }),
    ).toBe(false);

    expect(
      hasExactAttendanceSubmissionFields({
        memberId: 'm1',
        displayNameSnapshot: 'Member One',
        serviceKey: 'service-1',
        servicePart: 1,
        submittedAt: {},
        extra: true,
      }),
    ).toBe(false);
  });

  it('parses public members and current service config', () => {
    expect(
      parsePublicMember('m1', {
        memberId: 'm1',
        displayLabel: 'Member One',
        searchName: 'member one',
        sortKey: 'member one',
      }),
    ).toEqual({
      id: 'm1',
      displayLabel: 'Member One',
    });

    expect(parsePublicMember('m1', { memberId: 'm1', displayLabel: '', searchName: 'm', sortKey: 'm' })).toBeNull();
    expect(parsePublicMember('m1', { memberId: 'm1', displayLabel: 'M', searchName: 'm', sortKey: 'm', extra: true })).toBeNull();
    expect(parseServiceConfig({ serviceKey: 'service-1' })).toEqual({ serviceKey: 'service-1' });
    expect(parseServiceConfig({ serviceKey: '' })).toBeNull();
  });

  it('validates local draft invariants before writing', () => {
    const member = {
      id: 'm1',
      displayLabel: 'Member One',
    };
    const config = { serviceKey: 'service-1' };

    expect(
      validateAttendanceSubmissionDraft(
        {
          memberId: 'm1',
          displayNameSnapshot: 'Member One',
          serviceKey: 'service-1',
          servicePart: 1,
        },
        member,
        config,
      ),
    ).toEqual({
      memberId: 'm1',
      displayNameSnapshot: 'Member One',
      serviceKey: 'service-1',
      servicePart: 1,
    });

    expect(() =>
      validateAttendanceSubmissionDraft(
        {
          memberId: 'm1',
          displayNameSnapshot: 'Wrong Name',
          serviceKey: 'service-1',
          servicePart: 1,
        },
        member,
        config,
      ),
    ).toThrow(/displayNameSnapshot/);

    expect(() =>
      validateAttendanceSubmissionDraft(
        {
          memberId: 'm1',
          displayNameSnapshot: 'Member One',
          serviceKey: 'old-service',
          servicePart: 1,
        },
        member,
        config,
      ),
    ).toThrow(/serviceKey/);

  });

  it('builds create payloads using an injected server timestamp', () => {
    const submittedAt = { __type: 'serverTimestamp' };

    expect(
      toAttendanceSubmissionCreate(
        {
          memberId: 'm1',
          displayNameSnapshot: 'Member One',
          serviceKey: 'service-1',
          servicePart: 1,
        },
        submittedAt,
      ),
    ).toEqual({
      memberId: 'm1',
      displayNameSnapshot: 'Member One',
      serviceKey: 'service-1',
      servicePart: 1,
      submittedAt,
    });
  });
});

describe('createFirestoreRepository', () => {
  it('uses a normalized prefix query capped at ten member documents', async () => {
    const queries: unknown[][] = [];
    const repository = createFirestoreRepository(makeFirestoreForRepository(queries));

    await repository.searchRegisteredMembers('  Member  ', 99);

    expect(queries[0]).toEqual([
      { fieldPath: 'searchName', opStr: '>=', value: 'member' },
      { fieldPath: 'searchName', opStr: '<=', value: 'member\uf8ff' },
      { fieldPath: 'searchName', directionStr: 'asc' },
      { limit: 10 },
    ]);
  });

  it('uses injected Firestore-like operations without credentials', async () => {
    const serverTimestamp = { __type: 'serverTimestamp' };
    const calls: Array<readonly unknown[]> = [];
    const firestore: FirestoreLike = {
      collection(path) {
        calls.push(['collection', path]);
        return { path };
      },
      doc(path) {
        calls.push(['doc', path]);
        return { path };
      },
      getDoc: async (ref) => {
        const path = (ref as { path: readonly string[] }).path;
        if (path[0] === 'members') {
          return {
            id: path[1],
            exists: () => true,
            data: () => ({
              memberId: path[1],
              displayLabel: 'Member One',
              searchName: 'member one',
              sortKey: 'member one',
            }),
          };
        }

        return {
          id: path[1],
          exists: () => true,
          data: () => ({ serviceKey: 'service-1' }),
        };
      },
      getDocs: async () => ({
        docs: [
          {
            id: 'm1',
            exists: () => true,
            data: () => ({
              memberId: 'm1',
              displayLabel: 'Member One',
              searchName: 'member one',
              sortKey: 'member one',
            }),
          },
        ],
      }),
      setDoc: async (ref, data) => {
        calls.push(['setDoc', ref, data]);
      },
      query(ref, ...constraints) {
        calls.push(['query', ref, constraints]);
        return { ref, constraints };
      },
      where(fieldPath, opStr, value) {
        return { fieldPath, opStr, value };
      },
      orderBy(fieldPath, directionStr) {
        return { fieldPath, directionStr };
      },
      limit(limit) {
        return { limit };
      },
      serverTimestamp() {
        calls.push(['serverTimestamp']);
        return serverTimestamp;
      },
      async getCount() {
        return 0;
      },
    };

    const repository = createFirestoreRepository(firestore);

    await expect(repository.searchRegisteredMembers('member')).resolves.toEqual([
      {
        memberId: 'm1',
        displayLabel: 'Member One',
        searchName: 'member one',
        sortKey: 'member one',
      },
    ]);
    await expect(repository.getCurrentServiceConfig()).resolves.toEqual({ serviceKey: 'service-1' });
    await expect(repository.getServiceConfig('service-1')).resolves.toEqual({ serviceKey: 'service-1' });
    await expect(
      repository.submitAttendance({
        memberId: 'm1',
        displayNameSnapshot: 'Member One',
        serviceKey: 'service-1',
        servicePart: 1,
      }),
    ).resolves.toEqual({ id: 'm1' });

    expect(calls).toContainEqual(['doc', ['members', 'm1']]);
    expect(calls).toContainEqual(['doc', ['serviceConfig', 'currentServiceKey']]);
    expect(calls).toContainEqual(['collection', ['attendanceServices', 'service-1', 'submissions']]);
    expect(calls).toContainEqual(['serverTimestamp']);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'setDoc',
          expect.anything(),
          {
            memberId: 'm1',
            displayNameSnapshot: 'Member One',
            serviceKey: 'service-1',
            servicePart: 1,
            submittedAt: serverTimestamp,
          },
        ]),
      ]),
    );
  });

  it('bounds attendance queries and scopes both list methods to the current service', async () => {
    const queries: unknown[][] = [];
    const collectionPaths: string[][] = [];
    const firestore = makeFirestoreForRepository(queries, { collectionPaths });
    const repository = createFirestoreRepository(firestore);

    await repository.getCurrentServiceAttendance(7);
    await repository.listMemberHistory('m1', 3);

    expect(queries[0]).toEqual(expect.arrayContaining([
      { limit: 7 },
    ]));
    expect(queries[1]).toEqual(expect.arrayContaining([
      { limit: 2_000 },
    ]));
    expect(queries[2]).toEqual(expect.arrayContaining([
      { fieldPath: 'memberId', opStr: '==', value: 'm1' },
      { limit: 3 },
    ]));
    expect(collectionPaths).toContainEqual(['attendanceServices', '2026-08-10', 'submissions']);
  });

  it('loads dashboard totals through aggregate counts without attendance rows', async () => {
    const queries: unknown[][] = [];
    const repository = createFirestoreRepository(makeFirestoreForRepository(queries, {
      countResults: [1_207, 252, 425, 530],
    }));

    await expect(repository.getServiceAttendanceSummary('2026-08-09')).resolves.toEqual({
      serviceKey: '2026-08-09',
      totalCount: 1_207,
      partCounts: { 1: 252, 2: 425, 3: 530 },
    });
    expect(queries).toEqual([
      [{ limit: 2_000 }],
      [{ fieldPath: 'servicePart', opStr: '==', value: 1 }, { limit: 2_000 }],
      [{ fieldPath: 'servicePart', opStr: '==', value: 2 }, { limit: 2_000 }],
      [{ fieldPath: 'servicePart', opStr: '==', value: 3 }, { limit: 2_000 }],
    ]);
  });

  it('keeps read methods independent of object this binding', async () => {
    const repository = createFirestoreRepository(makeFirestoreForRepository([]));
    const { getCurrentServiceAttendance, listMemberHistory } = repository;

    await expect(getCurrentServiceAttendance(2)).resolves.toEqual({
      serviceKey: '2026-08-10',
      totalCount: 0,
      rows: [],
    });
    await expect(listMemberHistory('m1', 2)).resolves.toEqual([]);
  });

  it('filters registered members with missing document ids', async () => {
    const firestore = makeFirestoreForRepository([], {
      registeredMemberDocs: [
        {
          exists: () => true,
          data: () => ({
            memberId: 'missing-id',
            displayLabel: 'Missing ID',
            searchName: 'missing id',
            sortKey: 'missing id',
          }),
        },
        {
          id: 'm1',
          exists: () => true,
          data: () => ({
            memberId: 'm1',
            displayLabel: 'Member One',
            searchName: 'member one',
            sortKey: 'member one',
          }),
        },
      ],
    });

    await expect(createFirestoreRepository(firestore).searchRegisteredMembers('member')).resolves.toEqual([
      {
        memberId: 'm1',
        displayLabel: 'Member One',
        searchName: 'member one',
        sortKey: 'member one',
      },
    ]);
  });

  it('does not write when member validation fails', async () => {
    let writes = 0;
    const firestore = makeFirestoreForRepository([], {
      onWrite: () => { writes += 1; },
      memberExists: false,
    });
    await expect(createFirestoreRepository(firestore).submitAttendance({
      memberId: 'missing', displayNameSnapshot: 'Missing', serviceKey: '2026-08-10', servicePart: 1,
    })).rejects.toThrow(/missing or invalid/);
    expect(writes).toBe(0);
  });

  it('keeps the first service part when the same member scans again', async () => {
    let writes = 0;
    const firestore = makeFirestoreForRepository([], {
      onWrite: () => { writes += 1; },
      attendanceDocs: [
        {
          id: 'existing-attendance',
          exists: () => true,
          data: () => ({
            memberId: 'm1',
            displayNameSnapshot: 'Member One',
            serviceKey: '2026-08-10',
            servicePart: 1,
            submittedAt: new Date('2026-08-10T00:30:00.000Z'),
          }),
        },
      ],
    });

    await expect(createFirestoreRepository(firestore).submitAttendance({
      memberId: 'm1',
      displayNameSnapshot: 'Member One',
      serviceKey: '2026-08-10',
      servicePart: 3,
    })).resolves.toMatchObject({
      id: 'existing-attendance',
      servicePart: 1,
    });
    expect(writes).toBe(0);
  });

  it('recovers the first record when concurrent scans race to create the same member document', async () => {
    const concurrentlyCreated = {
      id: 'm1',
      exists: () => true,
      data: () => ({
        memberId: 'm1',
        displayNameSnapshot: 'Member One',
        serviceKey: '2026-08-10',
        servicePart: 1,
        submittedAt: new Date('2026-08-10T00:30:00.000Z'),
      }),
    };
    const firestore = makeFirestoreForRepository([], {
      writeError: new Error('already exists'),
      attendanceDocsAfterWrite: [concurrentlyCreated],
    });

    await expect(createFirestoreRepository(firestore).submitAttendance({
      memberId: 'm1',
      displayNameSnapshot: 'Member One',
      serviceKey: '2026-08-10',
      servicePart: 3,
    })).resolves.toMatchObject({
      id: 'm1',
      servicePart: 1,
    });
  });

  it('does not write when the selected member snapshot has no document id', async () => {
    let writes = 0;
    const firestore = makeFirestoreForRepository([], {
      onWrite: () => { writes += 1; },
      memberSnapshotId: null,
    });

    await expect(createFirestoreRepository(firestore).submitAttendance({
      memberId: 'm1',
      displayNameSnapshot: 'Member One',
      serviceKey: '2026-08-10',
      servicePart: 1,
    })).rejects.toThrow(/missing or invalid/);
    expect(writes).toBe(0);
  });

  it('filters attendance records with missing document ids', async () => {
    const submittedAt = new Date('2026-08-10T01:00:00.000Z');
    const firestore = makeFirestoreForRepository([], {
      attendanceDocs: [
        {
          exists: () => true,
          data: () => ({
            memberId: 'm1',
            displayNameSnapshot: 'Member One',
            serviceKey: '2026-08-10',
          }),
        },
        {
          id: 'submission-1',
          exists: () => true,
          data: () => ({
            memberId: 'm1',
            displayNameSnapshot: 'Member One',
            serviceKey: '2026-08-10',
            servicePart: 2,
            submittedAt,
          }),
        },
      ],
    });

    await expect(createFirestoreRepository(firestore).getCurrentServiceAttendance()).resolves.toMatchObject({
      serviceKey: '2026-08-10',
      rows: [
        {
          id: 'submission-1',
          memberId: 'm1',
          displayNameSnapshot: 'Member One',
          serviceKey: '2026-08-10',
          servicePart: 2,
          submittedAt,
        },
      ],
    });
  });
});

interface FirestoreRepositoryFixtureOptions {
  onWrite?: () => void;
  memberExists?: boolean;
  memberSnapshotId?: string | null;
  registeredMemberDocs?: ReadonlyArray<FirestoreDocumentSnapshot<unknown>>;
  attendanceDocs?: ReadonlyArray<FirestoreDocumentSnapshot<unknown>>;
  attendanceDocsAfterWrite?: ReadonlyArray<FirestoreDocumentSnapshot<unknown>>;
  collectionPaths?: string[][];
  countResults?: number[];
  writeError?: Error;
}

function makeFirestoreForRepository(
  queries: unknown[][],
  options: FirestoreRepositoryFixtureOptions = {},
): FirestoreLike {
  const {
    onWrite = () => {},
    memberExists = true,
    memberSnapshotId = 'm1',
    registeredMemberDocs = [],
    attendanceDocs = [],
    attendanceDocsAfterWrite = attendanceDocs,
    collectionPaths = [],
    countResults = [],
    writeError,
  } = options;
  let writeAttempted = false;

  return {
    collection: (path) => { collectionPaths.push([...path]); return { path }; },
    doc: (path) => ({ path }),
    getDoc: async (ref) => {
      const path = (ref as { path: string[] }).path;
      if (path[0] === 'members') {
        const snapshot = {
          exists: () => memberExists,
          data: () => ({
            memberId: path[1],
            displayLabel: 'Member One',
            searchName: 'member one',
            sortKey: 'member one',
          }),
        };

        return memberSnapshotId === null ? snapshot : { id: memberSnapshotId, ...snapshot };
      }
      return { id: path[1], exists: () => true, data: () => ({ serviceKey: '2026-08-10' }) };
    },
    getDocs: async (ref) => ({
      docs: (ref as { path?: readonly string[] }).path?.[0] === 'members'
        ? registeredMemberDocs
        : writeAttempted ? attendanceDocsAfterWrite : attendanceDocs,
    }),
    setDoc: async () => {
      writeAttempted = true;
      onWrite();
      if (writeError) throw writeError;
    },
    query: (ref, ...constraints) => {
      queries.push(constraints);
      return { ...(ref as { path?: readonly string[] }), constraints };
    },
    where: (fieldPath, opStr, value) => ({ fieldPath, opStr, value }),
    orderBy: (fieldPath, directionStr) => ({ fieldPath, directionStr }),
    limit: (limit) => ({ limit }),
    serverTimestamp: () => ({}),
    getCount: async () => countResults.shift() ?? 0,
  };
}
