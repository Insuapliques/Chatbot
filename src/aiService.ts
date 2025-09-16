import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";

import { db } from "./firebaseConfig";

interface EntrenamientoConfig {
  promptBase: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  closingKeyword?: string;
}

type MessageRole = "user" | "assistant" | "system" | "developer";

export interface AIContextMessage {
  role: MessageRole;
  content: string;
}

interface AnswerWithPromptBaseParams {
  userMessage: string;
  context?: AIContextMessage[] | string | null;
}

export interface UsageMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AnswerWithPromptBaseResult {
  text: string;
  isClosing: boolean;
  model: string;
  latencyMs: number;
  usage?: UsageMetrics;
}

class AIService {
  private readonly client: OpenAI;

  private readonly model: string;

  private readonly fallbackModel?: string;

  private readonly timeoutMs: number;

  private readonly maxRetries: number;

  private readonly envDefaults: EntrenamientoConfig;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY no está configurada");
    }

    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = process.env.LLM_MODEL ?? "gpt-5";
    this.fallbackModel = process.env.LLM_FALLBACK || undefined;
    this.timeoutMs = this.parseIntegerEnv("LLM_TIMEOUT_MS", 20_000);
    this.maxRetries = Math.max(0, this.parseIntegerEnv("LLM_MAX_RETRIES", 2));
    this.envDefaults = this.loadEnvDefaults();
  }

  public async answerWithPromptBase({
    userMessage,
    context,
  }: AnswerWithPromptBaseParams): Promise<AnswerWithPromptBaseResult> {
    const trimmedMessage = userMessage?.trim();
    if (!trimmedMessage) {
      throw new Error("userMessage es requerido para generar una respuesta");
    }

    const config = await this.getEntrenamientoConfig();
    const modelsToTry = this.getModelsToTry();
    const attemptErrors: Error[] = [];

    for (const model of modelsToTry) {
      for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        const startedAt = Date.now();

        try {
          const response = await this.client.responses.create(
            {
              model,
              instructions: config.promptBase,
              input: this.buildInputMessages(trimmedMessage, context),
              temperature: config.temperature,
              top_p: config.top_p,
              max_output_tokens: config.max_tokens,
              frequency_penalty: config.frequency_penalty,
              presence_penalty: config.presence_penalty,
            },
            { signal: controller.signal }
          );

          const latencyMs = Date.now() - startedAt;
          const text = this.extractResponseText(response);
          if (!text) {
            throw new Error("La respuesta del modelo no contiene texto");
          }

          const usage = response.usage
            ? {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
                totalTokens: response.usage.total_tokens,
              }
            : undefined;

          console.info(
            `[AIService] Modelo ${model} intento ${attempt + 1} exitoso en ${latencyMs}ms (tokens totales: ${
              usage?.totalTokens ?? "n/d"
            })`
          );

          const closingKeyword =
            config.closingKeyword?.trim() || this.envDefaults.closingKeyword?.trim() || "";
          const isClosing = closingKeyword
            ? text.toLowerCase().includes(closingKeyword.toLowerCase())
            : false;

          return {
            text,
            isClosing,
            model,
            latencyMs,
            usage,
          };
        } catch (error) {
          const latencyMs = Date.now() - startedAt;
          const typedError = error instanceof Error ? error : new Error(String(error));
          attemptErrors.push(typedError);

          const reason = typedError.name === "AbortError" ? "timeout" : typedError.message;
          console.warn(
            `[AIService] Modelo ${model} intento ${attempt + 1} falló tras ${latencyMs}ms (${reason})`
          );

          const shouldRetry = attempt < this.maxRetries && this.isRetryableError(typedError);
          if (!shouldRetry) {
            console.warn(`[AIService] No se reintentará el modelo ${model} en este ciclo.`);
            break;
          }
        } finally {
          clearTimeout(timeout);
        }
      }
    }

    throw new AggregateError(
      attemptErrors,
      "No se pudo generar una respuesta con los modelos configurados."
    );
  }

  private buildInputMessages(
    userMessage: string,
    context?: AnswerWithPromptBaseParams["context"]
  ): Array<{ role: MessageRole; content: string }> {
    const messages: Array<{ role: MessageRole; content: string }> = [];

    if (Array.isArray(context)) {
      for (const message of context) {
        if (!message?.content?.trim()) continue;
        messages.push({ role: message.role, content: message.content.trim() });
      }
    } else if (typeof context === "string" && context.trim()) {
      messages.push({ role: "system", content: context.trim() });
    }

    messages.push({ role: "user", content: userMessage });

    return messages;
  }

  private isRetryableError(error: Error & { status?: number }): boolean {
    if (error.name === "AbortError") {
      return true;
    }

    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      if (status === 429 || status === 408) return true;
      if (status >= 500) return true;
      return false;
    }

    return true;
  }

  private extractResponseText(response: any): string {
    if (typeof response?.output_text === "string" && response.output_text.trim()) {
      return response.output_text.trim();
    }

    if (Array.isArray(response?.output)) {
      const collected: string[] = [];
      for (const item of response.output) {
        if (item?.type === "message" && Array.isArray(item.content)) {
          for (const contentItem of item.content) {
            if (contentItem?.type === "output_text" && typeof contentItem.text === "string") {
              collected.push(contentItem.text);
            }
          }
        } else if (item?.type === "output_text" && typeof item.text === "string") {
          collected.push(item.text);
        }
      }

      if (collected.length > 0) {
        return collected.join("\n").trim();
      }
    }

    return "";
  }

  private getModelsToTry(): string[] {
    const models = new Set<string>();
    models.add(this.model);
    if (this.fallbackModel && this.fallbackModel !== this.model) {
      models.add(this.fallbackModel);
    }
    return Array.from(models);
  }

  private parseIntegerEnv(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }

  private parseFloatEnv(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }

  private loadEnvDefaults(): EntrenamientoConfig {
    return {
      promptBase:
        process.env.LLM_PROMPT_BASE || "Actúa como un asistente de ventas que impulsa conversiones.",
      temperature: this.parseFloatEnv("LLM_TEMPERATURE", 0.7),
      top_p: this.parseFloatEnv("LLM_TOP_P", 1),
      max_tokens: this.parseIntegerEnv("LLM_MAX_TOKENS", 512),
      frequency_penalty: this.parseFloatEnv("LLM_FREQUENCY_PENALTY", 0),
      presence_penalty: this.parseFloatEnv("LLM_PRESENCE_PENALTY", 0),
      closingKeyword: process.env.LLM_CLOSING_KEYWORD || "Lead en Proceso",
    };
  }

  private async getEntrenamientoConfig(): Promise<EntrenamientoConfig> {
    const docRef = db.collection("settings").doc("EntrenamientoConfig");
    const snapshot = await docRef.get();
    const defaults = this.envDefaults;

    if (!snapshot.exists) {
      await docRef.set(defaults);
      return defaults;
    }

    const data = snapshot.data() ?? {};
    const normalized = this.normalizeEntrenamientoConfig(data);
    const merged: EntrenamientoConfig = {
      ...defaults,
      ...normalized,
    };

    const persisted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== null) {
        persisted[key] = value;
      }
    }

    const needsUpdate = Object.keys(persisted).some((key) => data[key] === undefined);
    if (needsUpdate) {
      await docRef.set(persisted, { merge: true });
    }

    return merged;
  }

  private normalizeEntrenamientoConfig(raw: Record<string, unknown>): Partial<EntrenamientoConfig> {
    const normalized: Partial<EntrenamientoConfig> = {};

    const prompt = this.asString(raw.promptBase ?? raw.entrenamiento_base);
    if (prompt) normalized.promptBase = prompt;

    const closingKeyword = this.asString(raw.closingKeyword ?? raw.palabra_cierre);
    if (closingKeyword) normalized.closingKeyword = closingKeyword;

    const temperature = this.asNumber(raw.temperature ?? raw.temperatura);
    if (temperature !== undefined) normalized.temperature = temperature;

    const topP = this.asNumber(raw.top_p ?? raw.topP);
    if (topP !== undefined) normalized.top_p = topP;

    const maxTokens = this.asNumber(raw.max_tokens ?? raw.maxTokens ?? raw.max_output_tokens);
    if (maxTokens !== undefined) normalized.max_tokens = Math.max(1, Math.round(maxTokens));

    const frequencyPenalty = this.asNumber(
      raw.frequency_penalty ?? raw.frequencyPenalty ?? raw.penalizacion_frecuencia
    );
    if (frequencyPenalty !== undefined) normalized.frequency_penalty = frequencyPenalty;

    const presencePenalty = this.asNumber(
      raw.presence_penalty ?? raw.presencePenalty ?? raw.penalizacion_presencia
    );
    if (presencePenalty !== undefined) normalized.presence_penalty = presencePenalty;

    return normalized;
  }

  private asString(value: unknown): string | undefined {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    return undefined;
  }

  private asNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number.parseFloat(value.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }
}

export const aiService = new AIService();

export const answerWithPromptBase = (
  params: AnswerWithPromptBaseParams
): Promise<AnswerWithPromptBaseResult> => aiService.answerWithPromptBase(params);

export const buscarProductoChatbot = async (mensaje: string) => {
  const snapshot = await db.collection("productos_chatbot").get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const keywords = Array.isArray(data.keyword) ? data.keyword : [data.keyword];
    const match = keywords.some((palabra: string) =>
      mensaje.toLowerCase().includes(palabra.toLowerCase())
    );
    if (match) {
      return {
        respuesta: data.respuesta || "",
        tipo: data.tipo || "imagen",
        url: data.url || "",
      };
    }
  }

  return null;
};

export { AIService };
