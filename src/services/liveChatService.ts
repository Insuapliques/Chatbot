import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firebaseConfig';

export interface OperatorInfo {
  id?: string | null;
  name?: string | null;
}

interface BaseParams {
  userId: string;
  operator?: OperatorInfo;
}

export interface EnableHandoffParams extends BaseParams {
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface DisableHandoffParams extends BaseParams {
  reason?: string;
}

export interface OperatorReplyParams extends BaseParams {
  message?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
}

const statesCollection = db.collection('liveChatStates');
const liveChatCollection = db.collection('liveChat');

const buildOperatorPayload = (operator?: OperatorInfo) => {
  if (operator === undefined) {
    return undefined;
  }

  return {
    id: operator?.id ?? null,
    nombre: operator?.name ?? null,
  };
};

export const enableHandoff = async ({
  userId,
  operator,
  reason,
  metadata,
}: EnableHandoffParams) => {
  if (!userId) {
    throw new Error('userId es requerido para habilitar el modo humano.');
  }

  const timestamp = FieldValue.serverTimestamp();

  const payload: Record<string, unknown> = {
    modoHumano: true,
    actualizadoEn: timestamp,
    habilitadoEn: timestamp,
  };

  const operatorPayload = buildOperatorPayload(operator);
  if (operatorPayload !== undefined) {
    payload.operador = operatorPayload;
  }

  if (reason) {
    payload.solicitud = {
      origen: reason,
      timestamp,
    };
  }

  if (metadata) {
    payload.metadata = metadata;
  }

  await statesCollection.doc(userId).set(payload, { merge: true });
  return payload;
};

export const disableHandoff = async ({
  userId,
  operator,
  reason,
}: DisableHandoffParams) => {
  if (!userId) {
    throw new Error('userId es requerido para deshabilitar el modo humano.');
  }

  const timestamp = FieldValue.serverTimestamp();

  const payload: Record<string, unknown> = {
    modoHumano: false,
    actualizadoEn: timestamp,
    deshabilitadoEn: timestamp,
  };

  const operatorPayload = buildOperatorPayload(operator);
  if (operatorPayload !== undefined) {
    payload.operador = operatorPayload;
  }

  if (reason) {
    payload.ultimaActualizacionPor = {
      origen: reason,
      timestamp,
    };
  }

  await statesCollection.doc(userId).set(payload, { merge: true });
  return payload;
};

export const operatorReply = async ({
  userId,
  operator,
  message,
  mediaUrl = null,
  mediaType = null,
}: OperatorReplyParams) => {
  if (!userId) {
    throw new Error('userId es requerido para enviar un mensaje del operador.');
  }

  if (!message && !mediaUrl) {
    throw new Error('Se requiere un mensaje o un medio para responder al cliente.');
  }

  const timestamp = FieldValue.serverTimestamp();

  const operatorPayload = buildOperatorPayload(operator) ?? {
    id: null,
    nombre: null,
  };

  const entry = {
    user: userId,
    text: message ?? '',
    fileUrl: mediaUrl,
    fileType: mediaUrl ? mediaType ?? 'file' : 'text',
    timestamp,
    origen: 'operador' as const,
    operador: operatorPayload,
  };

  await liveChatCollection.add(entry);

  const stateUpdate: Record<string, unknown> = {
    modoHumano: true,
    operador: operatorPayload,
    actualizadoEn: timestamp,
    ultimaRespuestaOperador: timestamp,
  };

  await statesCollection.doc(userId).set(stateUpdate, { merge: true });

  return entry;
};
