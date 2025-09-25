/**
 * Servicio de IA con:
 *  - Modelo configurable (por defecto gpt-5)
 *  - Memoria LTM: guarda "recuerdos" y los inyecta como preámbulo de sistema
 *  - Llamada simple a Chat Completions (fetch) para máxima compatibilidad
 *
 * Requisitos:
 *  - process.env.OPENAI_API_KEY
 *  - process.env.LLM_MODEL (opcional, default: gpt-5)
 *  - Firestore Admin inicializado en ../firebaseConfig (export db)
 */

import fetch from "node-fetch";
import { db } from "../firebaseConfig";
import { QuerySnapshot } from "firebase-admin/firestore";
import { extractMemoryCandidates, shouldRemeber } from "./memoryExtractor";

const DEFAULT_MODEL = process.env.LLM_MODEL ?? "gpt-5";
const MEMORY_TOP_K = Number(process.env.MEMORY_TOP_K ?? 6);
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

type MetadataInput = Record<string, string | number | boolean | null>;

export type CreateResponseInput = {
  userMessage: string;
  userId?: string;
  threadId?: string;
  metadata?: MetadataInput;
};

export type CreateResponseResult = {
  ok: boolean;
  text?: string;
  modelUsed: string;
  latencyMs: number;
  raw?: any;
  error?: string;
};

async function recallUserContext(userId: string): Promise<string[]> {
  if (!userId) return [];
  const snap: QuerySnapshot = await db
    .collection("user_memories")
    .where("userId", "==", userId)
    .orderBy("ts", "desc")
    .limit(MEMORY_TOP_K)
    .get();

  return snap.docs
    .map((d) => String((d.data() as any).text || ""))
    .filter(Boolean);
}

async function storeMemoriesIfAny(userId: string, userMsg: string) {
  if (!userId || !userMsg) return;
  if (!shouldRemember(userMsg)) return;
  const candidates = extractMemoryCandidates(userMsg);
  if (!candidates.length) return;

  const batch = db.batch();
  const col = db.collection("user_memories");
  const now = Date.now();

  for (const text of candidates) {
    const ref = col.doc();
    batch.set(ref, { userId, text, tags: ["auto"], ts: now });
  }

  await batch.commit();
}

export async function createResponse(
  options: CreateResponseInput
): Promise<CreateResponseResult> {
  const start = Date.now();
  const model = options?.metadata?.model || DEFAULT_MODEL;
  const userMessage = (options.userMessage ?? "").trim();
  const userId = options.userId ?? options?.metadata?.userId ?? "";

  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      modelUsed: model,
      latencyMs: 0,
      error: "OPENAI_API_KEY no configurada",
    };
  }

  try {
    await storeMemoriesIfAny(userId, userMessage);
  } catch {
    // no romper el flujo si falla
  }

  let recalled: string[] = [];
  try {
    recalled = await recallUserContext(userId);
  } catch {
    // noop
  }

  const memoryPreamble = recalled.length
    ? `Datos conocidos del usuario:\n- ${recalled.join("\n- ")}\nUsa estos datos solo si son pertinentes a la consulta actual.`
    : "";

  const systemBase =
    "Eres un asistente útil y respetuoso con la privacidad. Si existen datos conocidos del usuario, úsalos con criterio y no inventes recuerdos.";
  const messages = [
    {
      role: "system",
      content: [memoryPreamble, systemBase].filter(Boolean).join("\n\n"),
    },
    { role: "user", content: userMessage },
  ];

  try {
    const resp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
      }),
    });

    const data = await resp.json();
    const latencyMs = Date.now() - start;

    if (!resp.ok) {
      return {
        ok: false,
        modelUsed: model,
        latencyMs,
        error: data?.error?.message || `Error HTTP ${resp.status}`,
        raw: data,
      };
    }

    const text =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      "";

    return {
      ok: true,
      text,
      modelUsed: model,
      latencyMs,
      raw: data,
    };
  } catch (e: any) {
    const latencyMs = Date.now() - start;
    return {
      ok: false,
      modelUsed: model,
      latencyMs,
      error: e?.message || "Fallo al llamar al proveedor de IA",
    };
  }
}
