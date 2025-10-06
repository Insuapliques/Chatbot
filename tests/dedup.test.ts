import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Firestore
const mockStateDoc = vi.fn();
const mockStateSet = vi.fn();
const mockCollectionAdd = vi.fn();

vi.mock('../src/firebaseConfig', () => ({
  db: {
    collection: vi.fn((name: string) => {
      if (name === 'liveChatStates') {
        return {
          doc: vi.fn(() => ({
            get: mockStateDoc,
            set: mockStateSet,
          })),
        };
      }
      if (name === 'logs') {
        return {
          doc: vi.fn(() => ({
            collection: vi.fn(() => ({
              add: mockCollectionAdd,
            })),
          })),
        };
      }
      return {};
    }),
  },
}));

describe('dedup middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStateSet.mockResolvedValue(undefined);
    mockCollectionAdd.mockResolvedValue({ id: 'log-id' });
  });

  it('returns false for first message (not duplicate)', async () => {
    mockStateDoc.mockResolvedValue({
      exists: false,
      data: () => ({}),
    });

    const { shouldSkipByMessageId } = await import('../src/middleware/dedup');

    const result = await shouldSkipByMessageId('1234567890', 'msg-001');

    expect(result).toBe(false);
    expect(mockStateSet).toHaveBeenCalledWith(
      { ultimoMessageId: 'msg-001' },
      { merge: true }
    );
    expect(mockCollectionAdd).not.toHaveBeenCalled();
  });

  it('returns true for duplicate message (same messageId)', async () => {
    mockStateDoc.mockResolvedValue({
      exists: true,
      data: () => ({ ultimoMessageId: 'msg-001' }),
    });

    const { shouldSkipByMessageId } = await import('../src/middleware/dedup');

    const result = await shouldSkipByMessageId('1234567890', 'msg-001');

    expect(result).toBe(true);
    expect(mockStateSet).not.toHaveBeenCalled();
    expect(mockCollectionAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '1234567890',
        messageId: 'msg-001',
      })
    );
  });

  it('returns false for new message after different messageId', async () => {
    mockStateDoc.mockResolvedValue({
      exists: true,
      data: () => ({ ultimoMessageId: 'msg-001' }),
    });

    const { shouldSkipByMessageId } = await import('../src/middleware/dedup');

    const result = await shouldSkipByMessageId('1234567890', 'msg-002');

    expect(result).toBe(false);
    expect(mockStateSet).toHaveBeenCalledWith(
      { ultimoMessageId: 'msg-002' },
      { merge: true }
    );
  });

  it('handles missing phone or messageId gracefully', async () => {
    const { shouldSkipByMessageId } = await import('../src/middleware/dedup');

    expect(await shouldSkipByMessageId('', 'msg-001')).toBe(false);
    expect(await shouldSkipByMessageId('1234567890', '')).toBe(false);
    expect(mockStateSet).not.toHaveBeenCalled();
  });
});
