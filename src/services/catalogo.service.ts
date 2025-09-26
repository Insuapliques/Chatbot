import type { CoreClass } from '@builderbot/bot';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firebaseConfig.js';
import { findProductoByMessage } from './productos.service.js';
import { normalize } from '../utils/text.js';
import { getChatState, logCatalogSent, logStateTransition } from '../conversation/state.js';

const REENVIO_REGEX = /(reenvia|otra vez|de nuevo|nuevamente)/i;

let botInstance: CoreClass | null = null;

export function setCatalogoBot(bot: CoreClass): void {
  botInstance = bot;
}

export async function intentarEnviarCatalogo(phone: string, text: string): Promise<boolean> {
  if (!botInstance) {
    console.warn('Bot instance no inicializada para envío de catálogos.');
    return false;
  }

  const provider = botInstance.provider;
  if (!provider) {
    console.warn('Provider no disponible en botInstance para envío de catálogos.');
    return false;
  }

  const normalizedText = normalize(text);
  const wantsResend = REENVIO_REGEX.test(normalizedText);

  const { ref, data: chatState } = await getChatState(phone);

  if (chatState.catalogoEnviado && !wantsResend) {
    return false;
  }

  const producto = await findProductoByMessage(text);
  if (!producto) {
    return false;
  }

  const caption = producto.respuesta?.trim()?.length ? producto.respuesta : 'Aquí tienes el catálogo solicitado.';
  let fallbackText = caption;
  if (producto.url) {
    fallbackText = `${caption}\n${producto.url}`.trim();
  }

  let fileUrl: string | null = null;
  let fileType: string = 'text';
  let loggedText = caption;

  try {
    if (producto.tipo === 'pdf' && producto.url) {
      await provider.sendMessageMeta({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'document',
        document: {
          link: producto.url,
          caption,
        },
      });
      fileUrl = producto.url;
      fileType = 'document';
      loggedText = caption;
    } else if (producto.tipo === 'image' && producto.url) {
      await provider.sendMessageMeta({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'image',
        image: {
          link: producto.url,
          caption,
        },
      });
      fileUrl = producto.url;
      fileType = 'image';
      loggedText = caption;
    } else if (producto.tipo === 'video' && producto.url) {
      await provider.sendMessageMeta({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'video',
        video: {
          link: producto.url,
          caption,
        },
      });
      fileUrl = producto.url;
      fileType = 'video';
      loggedText = caption;
    } else if (producto.tipo === 'url' && producto.url) {
      const outbound = `${caption}\n${producto.url}`.trim();
      await provider.sendMessage(phone, outbound);
      fileUrl = producto.url;
      fileType = 'text';
      loggedText = outbound;
    } else {
      await provider.sendMessage(phone, fallbackText);
      fileType = 'text';
      fileUrl = producto.url ?? null;
      loggedText = fallbackText;
    }
  } catch (error) {
    console.error('Error enviando catálogo multimedia, usando fallback de texto:', error);
    await provider.sendMessage(phone, fallbackText);
    fileType = 'text';
    fileUrl = producto.url ?? null;
    loggedText = fallbackText;
  }

  await db.collection('liveChat').add({
    user: phone,
    text: loggedText,
    fileUrl,
    fileType,
    timestamp: FieldValue.serverTimestamp(),
    origen: 'bot',
  });

  const updatePayload = {
    catalogoEnviado: true,
    catalogoRef: producto.keyword,
    estadoActual: 'CATALOGO_ENVIADO' as const,
    ultimoIntent: 'catalogo',
    productoActual: producto.keyword,
    ultimoCambio: FieldValue.serverTimestamp(),
  };

  await ref.set(updatePayload, { merge: true });

  if (chatState.estadoActual !== 'CATALOGO_ENVIADO') {
    await logStateTransition(phone, chatState.estadoActual, 'CATALOGO_ENVIADO', 'catalogo');
  }
  await logCatalogSent(phone);

  return true;
}
