import { FieldValue, Timestamp, DocumentReference } from 'firebase-admin/firestore';
import { db } from '../firebaseConfig.js';

export type EstadoConversacion =
  | 'GREETING'
  | 'DISCOVERY'
  | 'CATALOGO_ENVIADO'
  | 'COTIZACION'
  | 'CONFIRMACION'
  | 'CIERRE';

export interface ChatStateDoc {
  estadoActual: EstadoConversacion;
  productoActual?: string | null;
  catalogoEnviado: boolean;
  pedidoEnProceso: boolean;
  ultimoIntent?: string | null;
  ultimoCambio?: Timestamp | null;
  ultimoMessageId?: string | null;
  catalogoRef?: string | null;
  flags: {
    saludoHecho: boolean;
    nombreCapturado: boolean;
  };
  cooldowns?: Record<string, number>;
  ultimoContacto?: Timestamp | null;
  modoHumano?: boolean;
}

export interface ChatStateRecord {
  ref: DocumentReference<ChatStateDoc>;
  data: ChatStateDoc;
}

export const DEFAULT_CHAT_STATE: ChatStateDoc = {
  estadoActual: 'GREETING',
  productoActual: null,
  catalogoEnviado: false,
  pedidoEnProceso: false,
  ultimoIntent: null,
  ultimoCambio: null,
  ultimoMessageId: null,
  ultimoContacto: null,
  modoHumano: false,
  catalogoRef: null,
  flags: {
    saludoHecho: false,
    nombreCapturado: false,
  },
  cooldowns: {},
};

function mergeChatState(data: FirebaseFirestore.DocumentData | undefined): ChatStateDoc {
  if (!data) {
    return { ...DEFAULT_CHAT_STATE };
  }
  const flags = {
    ...DEFAULT_CHAT_STATE.flags,
    ...(data.flags ?? {}),
  };
  return {
    ...DEFAULT_CHAT_STATE,
    ...data,
    flags,
  };
}

export async function getChatState(phone: string): Promise<ChatStateRecord> {
  const ref = db.collection('liveChatStates').doc(phone) as DocumentReference<ChatStateDoc>;
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(DEFAULT_CHAT_STATE);
    return {
      ref,
      data: { ...DEFAULT_CHAT_STATE },
    };
  }
  const data = mergeChatState(snap.data());
  return { ref, data };
}

export async function setChatState(ref: DocumentReference<ChatStateDoc>, patch: Partial<ChatStateDoc>): Promise<void> {
  await ref.set(patch, { merge: true });
}

export function buildStatePatch(state: ChatStateDoc, patch: Partial<ChatStateDoc>): ChatStateDoc {
  return {
    ...state,
    ...patch,
    flags: {
      ...state.flags,
      ...(patch.flags ?? {}),
    },
  };
}

export async function updateChatState(
  ref: DocumentReference<ChatStateDoc>,
  updater: (current: ChatStateDoc) => Partial<ChatStateDoc>,
): Promise<ChatStateDoc> {
  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? mergeChatState(snap.data()) : { ...DEFAULT_CHAT_STATE };
    const patch = updater(current);
    const next = buildStatePatch(current, patch);
    tx.set(ref, patch, { merge: true });
    return next;
  });
}

export async function logStateTransition(phone: string, from: EstadoConversacion, to: EstadoConversacion, intent: string): Promise<void> {
  await db
    .collection('logs')
    .doc('stateTransitions')
    .collection('entries')
    .add({
      phone,
      from,
      to,
      intent,
      at: FieldValue.serverTimestamp(),
    });
}

export async function logDedupSkipped(phone: string, messageId: string): Promise<void> {
  await db
    .collection('logs')
    .doc('dedupSkipped')
    .collection('entries')
    .add({
      phone,
      messageId,
      at: FieldValue.serverTimestamp(),
    });
}

export async function logCatalogSent(phone: string): Promise<void> {
  await db
    .collection('logs')
    .doc('catalogSent')
    .collection('entries')
    .add({
      phone,
      at: FieldValue.serverTimestamp(),
    });
}

export function shouldThrottleIntent(
  state: ChatStateDoc,
  intent: string,
  now: Timestamp,
  thresholdMs = 90_000,
): boolean {
  if (!intent) {
    return false;
  }
  if (!state.ultimoIntent || !state.ultimoCambio) {
    return false;
  }
  if (state.ultimoIntent !== intent) {
    return false;
  }
  const delta = now.toMillis() - state.ultimoCambio.toMillis();
  return delta < thresholdMs;
}

export function withTimestamp(patch: Partial<ChatStateDoc>): Partial<ChatStateDoc> {
  return {
    ...patch,
    ultimoCambio: FieldValue.serverTimestamp() as unknown as Timestamp,
  };
}
