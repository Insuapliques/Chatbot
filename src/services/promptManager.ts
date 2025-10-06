import type { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';
import { db } from '../firebaseConfig.js';

export interface PromptParams {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
}

export interface PromptConfig {
  promptBase: string;
  closingWords: string[];
  closingMenu?: string;
  params: PromptParams;
  stream?: boolean;
  timeoutMs?: number;
}

const DEFAULT_DOC_PATH = process.env.FIRESTORE_PROMPT_DOC_PATH ?? 'settings/prompts';

const DEFAULT_CONFIG: PromptConfig = {
  promptBase:
    'Eres un asistente virtual experto en productos textiles y personalización. Responde de forma breve, clara y empática, ofreciendo ayuda adicional cuando sea útil.',
  closingWords: [],
  closingMenu: undefined,
  params: {
    temperature: 0.7,
    max_tokens: 600,
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
  },
  stream: false,
  timeoutMs: 20_000,
};

let cachedConfig: PromptConfig = { ...DEFAULT_CONFIG };
let initialized = false;
let unsubscribe: (() => void) | null = null;
let initializingPromise: Promise<void> | null = null;

function extractPromptBase(data: DocumentData | undefined): string {
  if (!data) {
    return DEFAULT_CONFIG.promptBase;
  }
  const candidateKeys = ['promptBase', 'prompt_base', 'entrenamiento_base'];
  for (const key of candidateKeys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return DEFAULT_CONFIG.promptBase;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeSnapshot(snapshot?: DocumentSnapshot<DocumentData>): PromptConfig {
  if (!snapshot || !snapshot.exists) {
    return { ...DEFAULT_CONFIG };
  }
  const data = snapshot.data() ?? {};
  const nestedParams =
    typeof data.params === 'object' && data.params !== null ? data.params : {};

  const promptBase = extractPromptBase(data);

  const closingWords: string[] = Array.isArray(data.closingWords)
    ? data.closingWords.filter((word) => typeof word === 'string' && word.trim())
    : DEFAULT_CONFIG.closingWords;

  const closingMenu =
    typeof data.closingMenu === 'string' && data.closingMenu.trim().length > 0
      ? data.closingMenu
      : undefined;

  const params: PromptParams = {
    temperature:
      toNumber(data.temperature ?? nestedParams.temperature) ??
      DEFAULT_CONFIG.params.temperature,
    max_tokens:
      toNumber(data.max_tokens ?? nestedParams.max_tokens) ??
      DEFAULT_CONFIG.params.max_tokens,
    top_p:
      toNumber(data.top_p ?? nestedParams.top_p) ?? DEFAULT_CONFIG.params.top_p,
    presence_penalty:
      toNumber(data.presence_penalty ?? nestedParams.presence_penalty) ??
      DEFAULT_CONFIG.params.presence_penalty,
    frequency_penalty:
      toNumber(data.frequency_penalty ?? nestedParams.frequency_penalty) ??
      DEFAULT_CONFIG.params.frequency_penalty,
  };

  const stream =
    typeof data.stream === 'boolean' ? data.stream : DEFAULT_CONFIG.stream;
  const timeoutMs =
    toNumber(data.timeoutMs) ?? DEFAULT_CONFIG.timeoutMs;

  return {
    promptBase,
    closingWords,
    closingMenu,
    params,
    stream,
    timeoutMs,
  };
}

function setCachedConfig(config: PromptConfig): void {
  cachedConfig = {
    promptBase: config.promptBase,
    closingWords: [...config.closingWords],
    closingMenu: config.closingMenu,
    params: { ...config.params },
    stream: config.stream,
    timeoutMs: config.timeoutMs,
  };
}

async function setupSnapshotListener(): Promise<void> {
  const docRef = db.doc(DEFAULT_DOC_PATH);
  const snapshot = await docRef.get();

  console.log(`[promptManager] 📚 Loading prompt from Firestore: ${DEFAULT_DOC_PATH}`);

  if (!snapshot.exists) {
    console.warn(
      `[promptManager] Documento ${DEFAULT_DOC_PATH} no encontrado en Firestore; se usará la configuración por defecto.`,
    );
    setCachedConfig({ ...DEFAULT_CONFIG });
  } else {
    const config = normalizeSnapshot(snapshot);
    console.log('[promptManager] ✅ Prompt loaded successfully:', {
      path: DEFAULT_DOC_PATH,
      promptBaseLength: config.promptBase.length,
      promptPreview: config.promptBase.substring(0, 150) + '...',
      closingWordsCount: config.closingWords.length,
      hasClosingMenu: !!config.closingMenu,
      params: config.params,
    });
    setCachedConfig(config);
  }

  unsubscribe = docRef.onSnapshot((snap) => {
    if (!snap.exists) {
      console.warn(
        `[promptManager] Documento ${DEFAULT_DOC_PATH} no encontrado en Firestore; se usará la configuración por defecto.`,
      );
      setCachedConfig({ ...DEFAULT_CONFIG });
      return;
    }
    setCachedConfig(normalizeSnapshot(snap));
  });
}

export async function ensurePromptConfig(): Promise<void> {
  if (initialized) {
    return;
  }
  if (initializingPromise) {
    return initializingPromise;
  }
  initializingPromise = setupSnapshotListener()
    .then(() => {
      initialized = true;
    })
    .finally(() => {
      initializingPromise = null;
    });
  return initializingPromise;
}

export async function getPromptConfig(): Promise<PromptConfig> {
  if (!initialized) {
    await ensurePromptConfig();
  }
  return {
    ...cachedConfig,
    closingWords: [...cachedConfig.closingWords],
    params: { ...cachedConfig.params },
  };
}

export function shouldAppendClosing(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }
  const normalized = text.toLowerCase();
  return cachedConfig.closingWords.some((word) =>
    normalized.includes(word.toLowerCase())
  );
}

export function stopPromptConfigListener(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  initialized = false;
}
