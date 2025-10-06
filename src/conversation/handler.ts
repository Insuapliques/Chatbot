import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../firebaseConfig.js';
import {
  ChatStateDoc,
  EstadoConversacion,
  getChatState,
  setChatState,
  logStateTransition,
  shouldThrottleIntent,
  withTimestamp,
} from './state.js';
import { downloadAndUploadToFirebase } from '../utils/media.js';
import { shouldSkipByMessageId } from '../middleware/dedup.js';
import { intentarEnviarCatalogo } from '../services/catalogo.service.js';

const PRODUCTOS = ['camiseta', 'camisetas', 'chompa', 'chompas', 'jogger', 'joggers', 'pantaloneta', 'pantalonetas'];
const POSITIVE_CONFIRMATION_REGEX = /(sí|si|correct(o|a)|confirmo|así es|de acuerdo|perfecto)/i;
const NEGATIVE_CONFIRMATION_REGEX = /(no|cambia|modificar|otra cosa)/i;

interface MetaFileData {
  id?: string;
  mime_type?: string;
  filename?: string;
}

export interface MetaMessageCtx {
  type: string;
  body?: string;
  from: string;
  message_id?: string;
  name?: string;
  pushName?: string;
  fileData?: MetaFileData | null;
}

export interface ConversationHandlerDeps {
  sendText: (phone: string, text: string) => Promise<void>;
}

interface OrderDetails {
  cantidad?: number;
  talla?: string;
  color?: string;
  mencionaPrecio?: boolean;
  hasAny: boolean;
}

function sanitizeText(body?: string): string {
  return (body ?? '').trim();
}

function detectProducto(text: string): string | null {
  if (!text) {
    return null;
  }
  const lower = text.toLowerCase();
  const found = PRODUCTOS.find((item) => lower.includes(item));
  return found ?? null;
}

function detectOrderDetails(text: string): OrderDetails {
  const cantidadMatch = text.match(/(?:\b|\s)(\d{1,3})(?:\s*(?:unidades?|uds?|piezas?|pz|pz\.))?/i);
  const tallaMatch = text.match(/talla\s*([a-z0-9]{1,4})/i);
  const colorMatch = text.match(/color\s*(?:es|:)?\s*([a-záéíóúñ]+)/i);
  const precioMatch = /(precio|vale|cuesta|cost|cotiza)/i.test(text);
  const details: OrderDetails = {
    cantidad: cantidadMatch ? Number.parseInt(cantidadMatch[1], 10) : undefined,
    talla: tallaMatch ? tallaMatch[1].toUpperCase() : undefined,
    color: colorMatch ? capitalize(colorMatch[1]) : undefined,
    mencionaPrecio: precioMatch,
    hasAny: Boolean(cantidadMatch || tallaMatch || colorMatch || precioMatch),
  };
  return details;
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function saveIncomingMessage(
  phone: string,
  payload: MetaMessageCtx,
  textBody: string,
  fileUrl: string | null,
  fileType: string,
): Promise<void> {
  await db.collection('liveChat').add({
    user: phone,
    text: textBody,
    fileUrl,
    fileType,
    timestamp: FieldValue.serverTimestamp(),
    origen: 'cliente',
  });
}

async function saveBotMessage(phone: string, text: string): Promise<void> {
  await db.collection('liveChat').add({
    user: phone,
    text,
    fileUrl: null,
    fileType: 'text',
    timestamp: FieldValue.serverTimestamp(),
    origen: 'bot',
  });
}

function buildOrderSummary(state: ChatStateDoc, details: OrderDetails): string {
  const parts: string[] = [];
  const producto = state.productoActual ?? 'producto';
  parts.push(`Producto: ${capitalize(producto)}`);
  if (details.cantidad) {
    parts.push(`Cantidad: ${details.cantidad}`);
  }
  if (details.talla) {
    parts.push(`Talla: ${details.talla}`);
  }
  if (details.color) {
    parts.push(`Color: ${details.color}`);
  }
  if (details.mencionaPrecio) {
    parts.push('Incluye solicitud de precio.');
  }
  const summary = `Tengo el siguiente resumen de tu pedido:\n- ${parts.join('\n- ')}\n¿Confirmas que es correcto?`;
  return summary;
}

function isPositiveConfirmation(text: string): boolean {
  return POSITIVE_CONFIRMATION_REGEX.test(text);
}

function isNegativeConfirmation(text: string): boolean {
  return NEGATIVE_CONFIRMATION_REGEX.test(text);
}

export function createConversationHandler(deps: ConversationHandlerDeps) {
  return async function handleConversation(ctx: MetaMessageCtx): Promise<void> {
    const { from: phone, message_id: messageId, type } = ctx;
    if (!phone || !messageId) {
      return;
    }

    // 1. DEDUPLICATION - Early return if duplicate
    if (await shouldSkipByMessageId(phone, messageId)) {
      ctx.body = '';
      return;
    }

    const incomingText = sanitizeText(ctx.body);
    const { ref, data: chatState } = await getChatState(phone);

    // 2. HUMAN HANDOFF - Early return if human mode active
    if (chatState.modoHumano === true) {
      // Log suppression
      await db.collection('logs').doc('sendSuppressedByHuman').collection('entries').add({
        phone,
        at: FieldValue.serverTimestamp(),
      });
      ctx.body = '';
      return;
    }

    // Handle media files
    let fileUrl: string | null = null;
    let fileType = type;
    if (type !== 'text' && ctx.fileData?.id) {
      try {
        fileUrl = await downloadAndUploadToFirebase(ctx.fileData.id, {
          mimeType: ctx.fileData.mime_type,
          fileName: ctx.fileData.filename,
          fallbackExt: resolveFallbackExtension(type),
          fallbackContentType: ctx.fileData.mime_type,
        });
      } catch (error) {
        console.error('Error subiendo media a Firebase:', error);
      }
    }

    await saveIncomingMessage(phone, ctx, incomingText, fileUrl, fileType);

    // 3. DETERMINISTIC CATALOG - Early return if catalog sent
    if (incomingText && await intentarEnviarCatalogo(phone, incomingText)) {
      ctx.body = '';
      return;
    }

    const now = Timestamp.now();
    const basePatch: Partial<ChatStateDoc> = {
      ultimoMessageId: messageId,
      ultimoContacto: FieldValue.serverTimestamp() as unknown as Timestamp,
    };
    const updates: Partial<ChatStateDoc> = { ...basePatch };
    const transitions: Array<{ from: EstadoConversacion; to: EstadoConversacion; intent: string }> = [];
    let currentState: EstadoConversacion = chatState.estadoActual;
    let handled = false;
    let recordedIntent: string | null = null;
    let productoActual = chatState.productoActual ?? null;

    const productoDetectado = detectProducto(incomingText);
    if (productoDetectado) {
      productoActual = productoDetectado;
      updates.productoActual = productoDetectado;
    }

    const sendTextIfNeeded = async (text: string, intent: string) => {
      if (shouldThrottleIntent(chatState, intent, now)) {
        return;
      }
      await deps.sendText(phone, text);
      await saveBotMessage(phone, text);
      handled = true;
      recordedIntent = intent;
      updates.ultimoIntent = intent;
      Object.assign(updates, withTimestamp({}));
    };

    const transitionTo = (next: EstadoConversacion, intent: string) => {
      if (chatState.pedidoEnProceso && next === 'DISCOVERY') {
        return;
      }
      if (currentState === next) {
        return;
      }
      transitions.push({ from: currentState, to: next, intent });
      currentState = next;
      updates.estadoActual = next;
      recordedIntent = intent;
      Object.assign(updates, withTimestamp({}));
    };

    if (!chatState.flags.saludoHecho) {
      await sendTextIfNeeded('¡Hola! Soy tu asistente de Mimétisa. ¿En qué puedo ayudarte hoy?', 'SALUDO');
      updates.flags = { ...chatState.flags, saludoHecho: true };
      if (currentState === 'GREETING') {
        transitionTo('DISCOVERY', 'SALUDO');
      }
    } else if (currentState === 'GREETING') {
      transitionTo('DISCOVERY', 'SALUDO');
    }

    if (incomingText) {
      const orderDetails = detectOrderDetails(incomingText);
      if (orderDetails.hasAny) {
        if (!productoActual) {
          productoActual = chatState.productoActual ?? 'producto';
          updates.productoActual = productoActual;
        }
        const resumen = buildOrderSummary({ ...chatState, productoActual }, orderDetails);
        await sendTextIfNeeded(resumen, 'RESUMEN_PEDIDO');
        updates.pedidoEnProceso = true;
        transitionTo('CONFIRMACION', 'RESUMEN_PEDIDO');
      }

      if ((currentState === 'CONFIRMACION' || chatState.estadoActual === 'CONFIRMACION') && isPositiveConfirmation(incomingText)) {
        await sendTextIfNeeded('Perfecto, procederemos con tu pedido. Te contactaremos a la brevedad para los siguientes pasos.', 'CONFIRMACION_POSITIVA');
        updates.pedidoEnProceso = false;
        transitionTo('CIERRE', 'CONFIRMACION_POSITIVA');
      } else if ((currentState === 'CONFIRMACION' || chatState.estadoActual === 'CONFIRMACION') && isNegativeConfirmation(incomingText)) {
        await sendTextIfNeeded('Entendido. Indícame los cambios y ajustamos tu pedido sin problema.', 'CONFIRMACION_NEGATIVA');
        updates.pedidoEnProceso = true;
        transitionTo('CONFIRMACION', 'CONFIRMACION_NEGATIVA');
      }
    }

    if (recordedIntent && !updates.ultimoIntent) {
      updates.ultimoIntent = recordedIntent;
    }

    await setChatState(ref, updates);
    if (transitions.length > 0) {
      await Promise.all(
        transitions.map(({ from, to, intent }) => logStateTransition(phone, from, to, intent)),
      );
    }

    if (handled) {
      ctx.body = '';
    }
  };
}

function resolveFallbackExtension(type: string): string {
  switch (type) {
    case 'image':
      return 'jpg';
    case 'audio':
      return 'ogg';
    case 'video':
      return 'mp4';
    case 'document':
      return 'pdf';
    default:
      return 'bin';
  }
}
