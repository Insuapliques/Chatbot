import { beforeEach, describe, expect, it, vi } from 'vitest';

interface CatalogDocInput {
  id?: string;
  data: Record<string, unknown>;
}

interface CatalogDoc {
  id: string;
  data: () => Record<string, unknown>;
}

const ensurePromptConfigMock = vi.fn(async () => undefined);
const defaultPromptConfig = {
  promptBase: 'Eres un asistente de prueba.',
  closingWords: [],
  closingMenu: undefined,
  params: {
    temperature: 0.7,
    max_tokens: 200,
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
  },
  stream: false,
  timeoutMs: 20_000,
};
const getPromptConfigMock = vi.fn(async () => ({ ...defaultPromptConfig }));
const shouldAppendClosingMock = vi.fn(() => false);

vi.mock('../src/services/promptManager', () => ({
  ensurePromptConfig: ensurePromptConfigMock,
  getPromptConfig: getPromptConfigMock,
  shouldAppendClosing: shouldAppendClosingMock,
}));

const catalogDocs: CatalogDoc[] = [];

const setCatalogDocs = (docs: CatalogDocInput[]): void => {
  catalogDocs.splice(
    0,
    catalogDocs.length,
    ...docs.map((doc, index) => ({
      id: doc.id ?? `doc-${index + 1}`,
      data: () => doc.data,
    })),
  );
};

const resetCatalogDocs = (): void => {
  catalogDocs.splice(0, catalogDocs.length);
};

vi.mock('../src/firebaseConfig', () => ({
  db: {
    collection: vi.fn((name: string) => {
      if (name === 'catalog_index') {
        return {
          get: vi.fn(async () => ({ docs: [...catalogDocs] })),
        };
      }
      return {
        get: vi.fn(async () => ({ docs: [] })),
      };
    }),
  },
  bucket: {},
}));

const responsesCreateMock = vi.fn();

vi.mock('openai', () => ({
  default: class MockOpenAI {
    public readonly responses = {
      create: responsesCreateMock,
    };

    constructor(_options: { apiKey: string }) {}
  },
}));

const keywordDoc = {
  id: 'poleras-2024-11',
  data: {
    title: 'Poleras Premium 2024',
    version: '2024-11',
    summary: 'Modelos actualizados de poleras premium y sus materiales.',
    keywords: ['polera', 'premium'],
  },
};

const intentDoc = {
  id: 'devoluciones-2025-01',
  data: {
    title: 'Políticas de Devolución',
    version: '2025-01',
    resumen: 'Procedimiento oficial para gestionar devoluciones y cambios.',
    intents: ['devoluciones'],
  },
};

describe('answerWithPromptBase catalog integration', () => {
  beforeEach(() => {
    vi.resetModules();
    resetCatalogDocs();
    responsesCreateMock.mockReset();
    ensurePromptConfigMock.mockClear();
    getPromptConfigMock.mockReset();
    getPromptConfigMock.mockResolvedValue({ ...defaultPromptConfig });
    shouldAppendClosingMock.mockReset();
    shouldAppendClosingMock.mockReturnValue(false);
    process.env.OPENAI_API_KEY = 'test-key';
    delete process.env.LLM_FALLBACK;
  });

  it('añade referencias del catálogo por keyword y cita la versión', async () => {
    setCatalogDocs([keywordDoc]);
    responsesCreateMock.mockResolvedValue({
      output_text: 'Tenemos varias opciones disponibles.',
      usage: { total_tokens: 120 },
    });

    const { answerWithPromptBase } = await import('../src/services/aiService');
    const result = await answerWithPromptBase({
      conversationId: 'conv-keyword',
      userMessage: '¿Tienen polera premium en tallas grandes?',
    });

    expect(responsesCreateMock).toHaveBeenCalledTimes(1);
    const requestPayload = responsesCreateMock.mock.calls[0]?.[0];
    expect(requestPayload).toBeDefined();
    const userMessage = requestPayload.input?.[1]?.content as string;
    expect(userMessage).toContain('Poleras Premium 2024');
    expect(userMessage).toContain('versión 2024-11');
    expect(userMessage).toContain('Catálogo vAAAA-MM');
    expect(result.text).toContain('(Catálogo v2024-11)');
    expect(shouldAppendClosingMock).toHaveBeenCalledWith(
      expect.stringContaining('(Catálogo v2024-11)'),
    );
  });

  it('detecta coincidencias por intent y agrega la cita correspondiente', async () => {
    setCatalogDocs([intentDoc]);
    responsesCreateMock.mockResolvedValue({
      output_text: 'Puedes gestionar devoluciones siguiendo estos pasos.',
      usage: { total_tokens: 98 },
    });

    const { answerWithPromptBase } = await import('../src/services/aiService');
    const result = await answerWithPromptBase({
      conversationId: 'conv-intent',
      userMessage: 'Necesito ayuda con una devolución de producto.',
      contextMetadata: {
        intent: 'devoluciones',
      },
    });

    const requestPayload = responsesCreateMock.mock.calls[0]?.[0];
    const userMessage = requestPayload.input?.[1]?.content as string;
    expect(userMessage).toContain('Políticas de Devolución');
    expect(userMessage).toContain('versión 2025-01');
    expect(result.text).toContain('(Catálogo v2025-01)');
    expect(shouldAppendClosingMock).toHaveBeenCalledWith(
      expect.stringContaining('(Catálogo v2025-01)'),
    );
  });
});
