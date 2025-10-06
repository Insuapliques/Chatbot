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
      if (name === 'liveChat' || name === 'logs') {
        return {
          add: mockCollectionAdd,
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

// Mock media utils
vi.mock('../src/utils/media', () => ({
  downloadAndUploadToFirebase: vi.fn(),
}));

// Mock state utils
vi.mock('../src/conversation/state', () => ({
  getChatState: vi.fn(async (phone: string) => {
    const snap = await mockStateDoc();
    return {
      ref: {
        set: mockStateSet,
      },
      data: snap.exists ? snap.data() : {
        estadoActual: 'GREETING',
        catalogoEnviado: false,
        pedidoEnProceso: false,
        flags: { saludoHecho: false, nombreCapturado: false },
        cooldowns: {},
      },
    };
  }),
  setChatState: mockStateSet,
  logStateTransition: vi.fn(),
  shouldThrottleIntent: vi.fn(() => false),
  withTimestamp: (patch: any) => patch,
}));

// Mock dedup
vi.mock('../src/middleware/dedup', () => ({
  shouldSkipByMessageId: vi.fn(async () => false),
}));

// Mock catalog service
const mockIntentarEnviarCatalogo = vi.fn();
vi.mock('../src/services/catalogo.service', () => ({
  intentarEnviarCatalogo: mockIntentarEnviarCatalogo,
}));

describe('modoHumano handling', () => {
  let sendTextMock: any;
  let createConversationHandler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStateSet.mockResolvedValue(undefined);
    mockCollectionAdd.mockResolvedValue({ id: 'log-id' });
    mockIntentarEnviarCatalogo.mockResolvedValue(false);

    sendTextMock = vi.fn();

    const handler = await import('../src/conversation/handler');
    createConversationHandler = handler.createConversationHandler;
  });

  it('suppresses all bot messages when modoHumano is true', async () => {
    mockStateDoc.mockResolvedValue({
      exists: true,
      data: () => ({
        estadoActual: 'DISCOVERY',
        catalogoEnviado: false,
        pedidoEnProceso: false,
        modoHumano: true,
        flags: { saludoHecho: true, nombreCapturado: false },
        cooldowns: {},
      }),
    });

    const handler = createConversationHandler({ sendText: sendTextMock });

    const ctx = {
      from: '1234567890',
      message_id: 'msg-human-001',
      type: 'text',
      body: 'Hola, necesito ayuda',
    };

    await handler(ctx);

    // Should not send any messages
    expect(sendTextMock).not.toHaveBeenCalled();

    // Should log suppression
    expect(mockCollectionAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '1234567890',
      })
    );

    // Context body should be cleared
    expect(ctx.body).toBe('');
  });

  it('does not trigger catalog when modoHumano is true', async () => {
    mockStateDoc.mockResolvedValue({
      exists: true,
      data: () => ({
        estadoActual: 'DISCOVERY',
        catalogoEnviado: false,
        modoHumano: true,
        pedidoEnProceso: false,
        flags: { saludoHecho: true, nombreCapturado: false },
        cooldowns: {},
      }),
    });

    const handler = createConversationHandler({ sendText: sendTextMock });

    const ctx = {
      from: '1234567890',
      message_id: 'msg-human-002',
      type: 'text',
      body: 'quiero ver el catálogo de chompas',
    };

    await handler(ctx);

    // Catalog service should not be called
    expect(mockIntentarEnviarCatalogo).not.toHaveBeenCalled();
    expect(sendTextMock).not.toHaveBeenCalled();
  });

  it('processes normally when modoHumano is false', async () => {
    mockStateDoc.mockResolvedValue({
      exists: true,
      data: () => ({
        estadoActual: 'DISCOVERY',
        catalogoEnviado: false,
        modoHumano: false,
        pedidoEnProceso: false,
        flags: { saludoHecho: true, nombreCapturado: false },
        cooldowns: {},
      }),
    });

    // Mock catalog to be sent
    mockIntentarEnviarCatalogo.mockResolvedValue(true);

    const handler = createConversationHandler({ sendText: sendTextMock });

    const ctx = {
      from: '1234567890',
      message_id: 'msg-normal-001',
      type: 'text',
      body: 'quiero ver chompas',
    };

    await handler(ctx);

    // Catalog should be attempted
    expect(mockIntentarEnviarCatalogo).toHaveBeenCalledWith('1234567890', 'quiero ver chompas');
  });
});
