import OpenAI from 'openai';
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
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

const TEMPERATURE_UNSUPPORTED_MODELS = new Set([
  'gpt-5',
  'gpt-5-latest',
]);

function modelSupportsTemperature(model: string): boolean {
  return !TEMPERATURE_UNSUPPORTED_MODELS.has(model);
}

const CATALOG_COLLECTION = 'catalog_index';
const MAX_CATALOG_MATCHES = Number(process.env.LLM_CATALOG_MAX_MATCHES ?? 3);
const VERSION_PATTERN = /^(\d{4})-(\d{2})$/;

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

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeStringArray(item));
  }
  if (typeof value === 'string') {
    return value
      .split(/[;,\n\r|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  return [];
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const lowered = value.toLowerCase();
    if (!seen.has(lowered)) {
      seen.add(lowered);
      result.push(value);
    }
  }
  return result;
}

function extractContextIntents(metadata?: MetadataInput): string[] {
  if (!metadata) {
    return [];
  }
  const intents: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'undefined' || value === null) {
      continue;
    }
    if (key.toLowerCase().includes('intent')) {
      intents.push(...normalizeStringArray(value));
    }
  }
  return uniqueStrings(intents);
}

function pickStringField(
  data: Record<string, unknown>,
  candidateKeys: string[],
): string | undefined {
  for (const candidate of candidateKeys) {
    const direct = data[candidate];
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }
  }
  const loweredCandidates = candidateKeys.map((key) => key.toLowerCase());
  for (const [key, value] of Object.entries(data)) {
    if (loweredCandidates.includes(key.toLowerCase()) && typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function collectFieldValues(
  data: Record<string, unknown>,
  keyFragments: string[],
): string[] {
  const values: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    const loweredKey = key.toLowerCase();
    if (keyFragments.some((fragment) => loweredKey.includes(fragment))) {
      values.push(...normalizeStringArray(value));
    }
  }
  return uniqueStrings(values);
}

function normalizeVersion(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const match = trimmed.match(/(\d{4})[-_.\s/]?(\d{1,2})/);
  if (!match) {
    return undefined;
  }
  const monthNumber = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return undefined;
  }
  const month = String(monthNumber).padStart(2, '0');
  return `${match[1]}-${month}`;
}

function truncateSummary(text: string | undefined, maxLength = 280): string | undefined {
  if (!text) {
    return undefined;
  }
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

interface CatalogMatch {
  title: string;
  displayVersion?: string;
  normalizedVersion?: string;
  summary?: string;
  matchedKeywords: string[];
  matchedIntents: string[];
  score: number;
}

interface CatalogPromptContext {
  addition: string;
  normalizedVersion?: string;
}

async function buildCatalogPromptContext(
  userMessage: string,
  metadata?: MetadataInput,
): Promise<CatalogPromptContext | null> {
  const lowerMessage = userMessage.toLowerCase();
  const requestedIntents = extractContextIntents(metadata).map((intent) => intent.toLowerCase());
  try {
    const snapshot = await db.collection(CATALOG_COLLECTION).get();
    const docs = Array.isArray(snapshot?.docs) ? snapshot.docs : [];
    if (!docs.length) {
      return null;
    }
    const matches: CatalogMatch[] = [];
    for (const doc of docs) {
      const rawData = typeof doc.data === 'function' ? doc.data() : undefined;
      if (!rawData || typeof rawData !== 'object') {
        continue;
      }
      const data = rawData as Record<string, unknown>;
      const title =
        pickStringField(data, ['title', 'titulo', 'name', 'nombre']) ?? doc.id ?? 'Recurso del catálogo';
      const versionCandidate =
        pickStringField(data, [
          'version',
          'versión',
          'catalogVersion',
          'versionCatalogo',
          'version_catalogo',
          'catalogoVersion',
        ]) ?? doc.id;
      const normalizedVersion = normalizeVersion(typeof versionCandidate === 'string' ? versionCandidate : undefined);
      const displayVersion = normalizedVersion ??
        (typeof versionCandidate === 'string' && versionCandidate.trim() ? versionCandidate.trim() : undefined);
      const summaries =
        pickStringField(data, ['summary', 'resumen', 'descripcion', 'description', 'detalle']) ?? undefined;
      const summary = truncateSummary(summaries);
      const keywords = collectFieldValues(data, ['keyword', 'palabra', 'tag']);
      const intents = collectFieldValues(data, ['intent']);
      const matchedKeywords = keywords.filter((keyword) =>
        lowerMessage.includes(keyword.toLowerCase()),
      );
      const matchedIntents = intents.filter((intent) =>
        requestedIntents.includes(intent.toLowerCase()),
      );
      const score = matchedKeywords.length + (matchedIntents.length > 0 ? 2 : 0);
      if (score > 0) {
        matches.push({
          title,
          displayVersion,
          normalizedVersion,
          summary,
          matchedKeywords,
          matchedIntents,
          score,
        });
      }
    }
    if (!matches.length) {
      return null;
    }
    matches.sort((a, b) => b.score - a.score);
    const selected = matches.slice(0, Math.max(1, Math.min(MAX_CATALOG_MATCHES, matches.length)));
    const lines = selected.map((match, index) => {
      const parts: string[] = [];
      const ordinal = `${index + 1}. ${match.title}`;
      const withVersion = match.displayVersion ? `${ordinal} (versión ${match.displayVersion})` : ordinal;
      parts.push(withVersion);
      if (match.summary) {
        parts.push(`Resumen: ${match.summary}`);
      }
      const reasons: string[] = [];
      if (match.matchedIntents.length) {
        reasons.push(`intención ${match.matchedIntents.join(', ')}`);
      }
      if (match.matchedKeywords.length) {
        reasons.push(`palabras clave ${match.matchedKeywords.join(', ')}`);
      }
      if (reasons.length) {
        parts.push(`Coincidencia por ${reasons.join(' y ')}.`);
      }
      return parts.join(' ');
    });
    const header = 'Referencias relevantes del catálogo disponibles para esta consulta:';
    const instruction =
      'Utiliza estas referencias y cita explícitamente la versión correspondiente como "(Catálogo vAAAA-MM)" en tu respuesta.';
    const addition = `${header}\n${lines.join('\n')}\n${instruction}`;
    const normalizedVersion = selected.find((match) => match.normalizedVersion)?.normalizedVersion;
    return { addition, normalizedVersion };
  } catch (error) {
    console.warn('[aiService] No fue posible consultar el índice del catálogo:', error);
    return null;
  }
}

function appendCatalogContext(message: string, addition?: string): string {
  if (!addition) {
    return message;
  }
  const sanitizedAddition = sanitizeMessage(addition);
  if (!sanitizedAddition) {
    return message;
  }
  if (message.length >= MAX_INPUT_LENGTH) {
    return message;
  }
  const available = MAX_INPUT_LENGTH - message.length - 2;
  if (available <= 0) {
    return message;
  }
  const trimmedAddition = sanitizedAddition.slice(0, available);
  return `${message}\n\n${trimmedAddition}`;
}

function ensureCatalogCitation(text: string, normalizedVersion?: string): string {
  if (!normalizedVersion || !VERSION_PATTERN.test(normalizedVersion)) {
    return text;
  }
  const citation = `(Catálogo v${normalizedVersion})`;
  if (!text) {
    return citation;
  }
  if (text.includes(citation)) {
    return text;
  }
  const trimmed = text.trimEnd();
  const trailingWhitespace = text.slice(trimmed.length);
  const needsSpace = trimmed.length > 0 && !/\s$/.test(trimmed);
  const augmented = `${trimmed}${needsSpace ? ' ' : ''}${citation}`;
  return `${augmented}${trailingWhitespace}`;
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
    const request: ResponseCreateParamsNonStreaming = {
      model: DEFAULT_MODEL,
      input: [
        { role: 'system', content: config.promptBase },
        { role: 'user', content: sanitizedMessage },
      ],
    };

    const { temperature, top_p, max_tokens } = config.params;

    if (typeof temperature === 'number') {
      if (modelSupportsTemperature(DEFAULT_MODEL)) {
        request.temperature = temperature;
      } else {
        console.warn(
          `[aiService] Temperatura configurada (${temperature}) ignorada: el modelo ${DEFAULT_MODEL} no admite este parámetro.`,
        );
      }
    }
    if (typeof top_p === 'number') {
      request.top_p = top_p;
    }
    if (typeof max_tokens === 'number') {
      request.max_output_tokens = max_tokens;
    }

    // The Responses API currently ignores presence/frequency penalties, so these
    // parameters are intentionally not forwarded. If we migrate to an endpoint
    // that supports them, map `config.params.presence_penalty` and
    // `config.params.frequency_penalty` conditionally at that time.

    if (metadata) {
      request.metadata = metadata;
    }

    const response = await client.responses.create(request, { signal: controller.signal });

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
  const catalogContext = await buildCatalogPromptContext(sanitizedMessage, options.contextMetadata);
  const messageWithCatalog = appendCatalogContext(
    sanitizedMessage,
    catalogContext?.addition,
  );
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
        messageWithCatalog,
        metadata,
        attempt + 1,
      );
      const finalText = ensureCatalogCitation(openAiResult.text, catalogContext?.normalizedVersion);
      const closingTriggered = shouldAppendClosing(finalText);
      return {
        text: finalText,
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
        `${config.promptBase}\n\nUsuario: ${messageWithCatalog}`,
      );
      registerFallbackSuccess();
      const finalText = ensureCatalogCitation(fallbackResult.text, catalogContext?.normalizedVersion);
      const closingTriggered = shouldAppendClosing(finalText);
      return {
        text: finalText,
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
