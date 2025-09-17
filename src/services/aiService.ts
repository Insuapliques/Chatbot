import OpenAI from 'openai';
import type { PromptConfig } from './promptManager';
import { ensurePromptConfig, getPromptConfig, shouldAppendClosing } from './promptManager';
import { db } from '../firebaseConfig';

type PrimitiveRecord = Record<string, string>;
type MetadataInput = Record<string, string | number | boolean | null>;

export interface AnswerOptions {
  conversationId: string;
  userMessage: string;
  contextMetadata?: MetadataInput;
}

export interface AnswerResult {
  text: string;
  closingTriggered: boolean;
  closingMenu?: string;
  latencyMs: number;
  tokens?: number;
  usedFallback: boolean;
}

const DEFAULT_MODEL = process.env.LLM_MODEL ?? 'gpt-5';
const DEFAULT_TIMEOUT = Number(process.env.LLM_TIMEOUT_MS ?? 20_000);
const MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES ?? 2);
const MAX_INPUT_LENGTH = Number(process.env.LLM_MAX_INPUT_CHARS ?? 6000);
const FALLBACK_DESCRIPTOR = process.env.LLM_FALLBACK;
const FALLBACK_FAILURE_THRESHOLD = Number(
  process.env.LLM_FALLBACK_FAILURE_THRESHOLD ?? 3,
);
const FALLBACK_COOLDOWN_MS = Number(
  process.env.LLM_FALLBACK_COOLDOWN_MS ?? 60_000,
);

interface FallbackState {
  failureCount: number;
  openUntil: number;
}

const fallbackState: FallbackState = {
  failureCount: 0,
  openUntil: 0,
};

let openAiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (process.env.LLM_PROVIDER && process.env.LLM_PROVIDER !== 'openai') {
    throw new Error(
      `LLM_PROVIDER=${process.env.LLM_PROVIDER} no es compatible con este servicio.`,
    );
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY no configurada.');
  }
  if (!openAiClient) {
    openAiClient = new OpenAI({ apiKey });
  }
  return openAiClient;
}

function sanitizeMessage(input: string): string {
  if (!input) {
    return '';
  }
  const trimmed = input.trim();
  const withoutBinary = Array.from(trimmed)
    .filter((char) => {
      const code = char.charCodeAt(0);
      if (code === 0x7f) {
        return false;
      }
      if (code < 0x20) {
        // Permitir saltos de línea y tabulaciones simples
        return code === 0x0a || code === 0x0d || code === 0x09;
      }
      return true;
    })
    .join('');
  if (withoutBinary.length <= MAX_INPUT_LENGTH) {
    return withoutBinary;
  }
  return withoutBinary.slice(0, MAX_INPUT_LENGTH);
}

function buildMetadata(options: AnswerOptions): PrimitiveRecord | undefined {
  if (!options.contextMetadata && !options.conversationId) {
    return undefined;
  }
  const metadata: PrimitiveRecord = {};
  if (options.conversationId) {
    metadata.conversationId = options.conversationId;
  }
  if (options.contextMetadata) {
    for (const [key, value] of Object.entries(options.contextMetadata)) {
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        value === null
      ) {
        metadata[key] = typeof value === 'string' ? value : String(value);
      }
    }
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function emitAiMetrics(payload: {
  model: string;
  provider: string;
  latencyMs: number;
  tokens?: number;
  usedFallback: boolean;
  success: boolean;
  attempt: number;
  errorMessage?: string;
}): void {
  const base = {
    provider: payload.provider,
    model: payload.model,
    latencyMs: payload.latencyMs,
    tokens: payload.tokens,
    usedFallback: payload.usedFallback,
    success: payload.success,
    attempt: payload.attempt,
  };
  if (payload.success) {
    console.info('[aiService] Respuesta IA', base);
  } else {
    console.warn('[aiService] Error IA', { ...base, errorMessage: payload.errorMessage });
  }
}

interface OpenAIResult {
  text: string;
  tokens?: number;
}

async function callOpenAI(
  config: PromptConfig,
  sanitizedMessage: string,
  metadata: PrimitiveRecord | undefined,
  attempt: number,
): Promise<OpenAIResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? DEFAULT_TIMEOUT);

  try {
    const client = getOpenAI();
    const response = await client.responses.create(
      {
        model: DEFAULT_MODEL,
        input: [
          { role: 'system', content: config.promptBase },
          { role: 'user', content: sanitizedMessage },
        ],
        temperature: config.params.temperature,
        top_p: config.params.top_p,
        presence_penalty: config.params.presence_penalty,
        frequency_penalty: config.params.frequency_penalty,
        max_output_tokens: config.params.max_tokens,
        metadata,
      },
      { signal: controller.signal },
    );

    const text = (response.output_text ?? '').trim();
    const tokens = response.usage?.total_tokens ?? undefined;
    emitAiMetrics({
      model: DEFAULT_MODEL,
      provider: 'openai',
      latencyMs: Date.now() - start,
      tokens,
      usedFallback: false,
      success: true,
      attempt,
    });
    return { text, tokens };
  } catch (error) {
    emitAiMetrics({
      model: DEFAULT_MODEL,
      provider: 'openai',
      latencyMs: Date.now() - start,
      usedFallback: false,
      success: false,
      attempt,
      errorMessage: error instanceof Error ? error.message : 'unknown-error',
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

interface FallbackResult {
  text: string;
}

function isFallbackAvailable(): boolean {
  if (!FALLBACK_DESCRIPTOR) {
    return false;
  }
  return fallbackState.openUntil < Date.now();
}

function registerFallbackFailure(): void {
  fallbackState.failureCount += 1;
  if (fallbackState.failureCount >= FALLBACK_FAILURE_THRESHOLD) {
    fallbackState.openUntil = Date.now() + FALLBACK_COOLDOWN_MS;
    fallbackState.failureCount = 0;
  }
}

function registerFallbackSuccess(): void {
  fallbackState.failureCount = 0;
  fallbackState.openUntil = 0;
}

async function callFallbackLLM(prompt: string): Promise<FallbackResult> {
  if (!FALLBACK_DESCRIPTOR) {
    throw new Error('Fallback no configurado');
  }

  const [provider, ...rest] = FALLBACK_DESCRIPTOR.split(':');
  const model = rest.join(':');

  if (FALLBACK_DESCRIPTOR.startsWith('http://') || FALLBACK_DESCRIPTOR.startsWith('https://')) {
    const response = await fetch(FALLBACK_DESCRIPTOR, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!response.ok) {
      throw new Error(`Fallback HTTP status ${response.status}`);
    }
    const data = (await response.json()) as { output?: string; text?: string };
    const text = data.output ?? data.text;
    if (!text) {
      throw new Error('Fallback sin respuesta de texto');
    }
    return { text };
  }

  if (provider === 'ollama') {
    const target = process.env.OLLAMA_ENDPOINT ?? 'http://127.0.0.1:11434/api/generate';
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt }),
    });
    if (!response.ok) {
      throw new Error(`Fallback Ollama status ${response.status}`);
    }
    const data = (await response.json()) as { response?: string; output?: string };
    const text = data.response ?? data.output;
    if (!text) {
      throw new Error('Fallback Ollama sin respuesta');
    }
    return { text };
  }

  throw new Error(`Proveedor de fallback no soportado: ${provider}`);
}

export async function answerWithPromptBase(options: AnswerOptions): Promise<AnswerResult> {
  const sanitizedMessage = sanitizeMessage(options.userMessage);
  const start = Date.now();
  let lastError: unknown;
  const metadata = buildMetadata(options);
  await ensurePromptConfig();
  let streamingWarned = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const config = await getPromptConfig();
      if (config.stream && !streamingWarned) {
        console.warn('⚠️ Streaming habilitado en configuración, pero la implementación actual usa respuestas no streaming.');
        streamingWarned = true;
      }
      const openAiResult = await callOpenAI(
        config,
        sanitizedMessage,
        metadata,
        attempt + 1,
      );
      const closingTriggered = shouldAppendClosing(openAiResult.text);
      return {
        text: openAiResult.text,
        closingTriggered,
        closingMenu: closingTriggered ? config.closingMenu : undefined,
        latencyMs: Date.now() - start,
        tokens: openAiResult.tokens,
        usedFallback: false,
      };
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES) {
        break;
      }
      const delay = Math.pow(2, attempt) * 250;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  if (isFallbackAvailable()) {
    try {
      const config = await getPromptConfig();
      const fallbackResult = await callFallbackLLM(
        `${config.promptBase}\n\nUsuario: ${sanitizedMessage}`,
      );
      registerFallbackSuccess();
      const closingTriggered = shouldAppendClosing(fallbackResult.text);
      return {
        text: fallbackResult.text,
        closingTriggered,
        closingMenu: closingTriggered ? config.closingMenu : undefined,
        latencyMs: Date.now() - start,
        usedFallback: true,
      };
    } catch (fallbackError) {
      registerFallbackFailure();
      lastError = fallbackError;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('No se pudo obtener respuesta del modelo principal ni del fallback.');
}

export const buscarProductoChatbot = async (mensaje: string) => {
  const snapshot = await db.collection('productos_chatbot').get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const keywords = Array.isArray(data.keyword) ? data.keyword : [data.keyword];
    const match = keywords.some((palabra: string) =>
      typeof palabra === 'string' && mensaje.toLowerCase().includes(palabra.toLowerCase()),
    );
    if (match) {
      return {
        respuesta: data.respuesta || '',
        tipo: data.tipo || 'imagen',
        url: data.url || '',
      };
    }
  }

  return null;
};
