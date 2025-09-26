import { db } from '../firebaseConfig.js';

export type ChatStateName =
  | 'GREETING'
  | 'DISCOVERY'
  | 'CATALOG_SENT'
  | 'ASSISTED_SELECTION'
  | 'ORDER_IN_PROGRESS'
  | 'POST_ORDER'
  | 'CLOSING';

export interface AskedRecently {
  key: string;
  lastAskedAt: number; // epoch ms
}

export interface Slots {
  talla?: string;
  color?: string;
  cantidad?: number;
  referencia?: string;
}

export interface ChatState {
  chatId: string;
  state?: ChatStateName;
  last_intent?: string | null;
  has_sent_catalog?: boolean;
  asked_recently?: AskedRecently[];
  slots?: Slots;
  modoHumano?: boolean;
  lastAiLatencyMs?: number;
  lastAiUsedFallback?: boolean;
  updatedAt?: number;
}

export async function getState(chatId: string): Promise<ChatState> {
  const ref = db.collection('liveChatStates').doc(chatId);
  const snap = await ref.get();
  const data = (snap.exists ? snap.data() : {}) as ChatState | undefined;
  return {
    chatId,
    has_sent_catalog: false,
    asked_recently: [],
    slots: {},
    ...data,
  };
}

export async function updateState(chatId: string, patch: Partial<ChatState>): Promise<void> {
  const ref = db.collection('liveChatStates').doc(chatId);
  await ref.set({ updatedAt: Date.now(), ...patch }, { merge: true });
}

export async function resetState(chatId: string): Promise<void> {
  await db.collection('liveChatStates').doc(chatId).delete();
}

export function shouldAsk(key: string, state: ChatState, cooldownMs = 3 * 60 * 1000): boolean {
  const now = Date.now();
  const arr = state.asked_recently ?? [];
  const found = arr.find(x => x.key === key);
  if (!found) return true;
  return now - found.lastAskedAt > cooldownMs;
}

export async function markAsked(chatId: string, state: ChatState, key: string): Promise<void> {
  const now = Date.now();
  const arr = state.asked_recently ?? [];
  const filtered = arr.filter(x => x.key != key);
  filtered.push({ key, lastAskedAt: now });
  await updateState(chatId, { asked_recently: filtered });
}