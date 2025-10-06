import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreClass } from '@builderbot/bot';

// Mock Firestore
const mockStateDoc = vi.fn();
const mockStateSet = vi.fn();
const mockCollectionGet = vi.fn();
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
      if (name === 'productos_chatbot') {
        return {
          get: mockCollectionGet,
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
      return { get: vi.fn(), add: vi.fn() };
    }),
  },
}));

// Mock text utils
vi.mock('../src/utils/text', () => ({
  normalize: (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(),
  includesAll: (haystack: string, needle: string) => {
    const h = haystack.toLowerCase();
    const n = needle.toLowerCase();
    return n.split(' ').every((word: string) => h.includes(word));
  },
}));

describe('catalogo.service', () => {
  let mockProvider: any;
  let mockBot: CoreClass;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockProvider = {
      sendMessage: vi.fn(),
      sendMessageMeta: vi.fn(),
    };

    mockBot = {
      provider: mockProvider,
    } as any;

    // Reset productos cache
    const { clearProductosCache } = await import('../src/services/productos.service');
    clearProductosCache();

    // Setup default mocks
    mockStateDoc.mockResolvedValue({
      exists: false,
      data: () => ({}),
    });
    mockStateSet.mockResolvedValue(undefined);
    mockCollectionAdd.mockResolvedValue({ id: 'mock-id' });
  });

  it('exact keyword match sends catalog once', async () => {
    // Setup productos
    mockCollectionGet.mockResolvedValue({
      docs: [
        {
          id: 'chompa-1',
          data: () => ({
            keyword: 'chompa premium',
            respuesta: 'Aquí están nuestras chompas premium',
            tipo: 'pdf',
            url: 'https://example.com/chompas.pdf',
          }),
        },
      ],
    });

    const { setCatalogoBot, intentarEnviarCatalogo } = await import('../src/services/catalogo.service');
    setCatalogoBot(mockBot);

    const result = await intentarEnviarCatalogo('1234567890', 'quiero ver chompa premium');

    expect(result).toBe(true);
    expect(mockProvider.sendMessageMeta).toHaveBeenCalledWith({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '1234567890',
      type: 'document',
      document: {
        link: 'https://example.com/chompas.pdf',
        caption: 'Aquí están nuestras chompas premium',
      },
    });

    // Check state update
    expect(mockStateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogoEnviado: true,
        has_sent_catalog: true,
        catalogoRef: 'chompa premium',
        estadoActual: 'CATALOGO_ENVIADO',
        state: 'CATALOG_SENT',
      }),
      { merge: true }
    );
  });

  it('fallback on catalogo/diseños/modelos when no exact match', async () => {
    mockCollectionGet.mockResolvedValue({
      docs: [
        {
          id: 'general-1',
          data: () => ({
            keyword: 'general',
            respuesta: 'Catálogo general',
            tipo: 'image',
            url: 'https://example.com/catalogo.jpg',
          }),
        },
      ],
    });

    const { setCatalogoBot, intentarEnviarCatalogo } = await import('../src/services/catalogo.service');
    setCatalogoBot(mockBot);

    const result = await intentarEnviarCatalogo('1234567890', 'quiero ver el catalogo');

    expect(result).toBe(true);
    expect(mockProvider.sendMessageMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'image',
      })
    );
  });

  it('no resend when catalogoEnviado is true', async () => {
    mockStateDoc.mockResolvedValue({
      exists: true,
      data: () => ({ catalogoEnviado: true }),
    });

    mockCollectionGet.mockResolvedValue({
      docs: [
        {
          id: 'test',
          data: () => ({
            keyword: 'test',
            respuesta: 'Test',
            tipo: 'texto',
          }),
        },
      ],
    });

    const { setCatalogoBot, intentarEnviarCatalogo } = await import('../src/services/catalogo.service');
    setCatalogoBot(mockBot);

    const result = await intentarEnviarCatalogo('1234567890', 'quiero test');

    expect(result).toBe(false);
    expect(mockProvider.sendMessage).not.toHaveBeenCalled();
  });

  it('resend allowed with reenvía/otra vez/again/resend', async () => {
    mockStateDoc.mockResolvedValue({
      exists: true,
      data: () => ({ catalogoEnviado: true }),
    });

    mockCollectionGet.mockResolvedValue({
      docs: [
        {
          id: 'chompa',
          data: () => ({
            keyword: 'chompa',
            respuesta: 'Chompas disponibles',
            tipo: 'texto',
          }),
        },
      ],
    });

    const { setCatalogoBot, intentarEnviarCatalogo } = await import('../src/services/catalogo.service');
    setCatalogoBot(mockBot);

    const result = await intentarEnviarCatalogo('1234567890', 'reenvía otra vez chompa');

    expect(result).toBe(true);
    expect(mockProvider.sendMessage).toHaveBeenCalled();
  });

  it('media failure falls back to text with URL', async () => {
    mockCollectionGet.mockResolvedValue({
      docs: [
        {
          id: 'video-test',
          data: () => ({
            keyword: 'video test',
            respuesta: 'Video de prueba',
            tipo: 'video',
            url: 'https://example.com/video.mp4',
          }),
        },
      ],
    });

    // Mock sendMessageMeta to fail
    mockProvider.sendMessageMeta.mockRejectedValue(new Error('Media send failed'));

    const { setCatalogoBot, intentarEnviarCatalogo } = await import('../src/services/catalogo.service');
    setCatalogoBot(mockBot);

    const result = await intentarEnviarCatalogo('1234567890', 'video test');

    expect(result).toBe(true);
    // Should fallback to sendMessage
    expect(mockProvider.sendMessage).toHaveBeenCalledWith(
      '1234567890',
      'Video de prueba\nhttps://example.com/video.mp4'
    );

    // Check failure log
    expect(mockCollectionAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '1234567890',
        error: 'Media send failed',
      })
    );
  });
});
