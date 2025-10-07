import type { CoreClass } from '@builderbot/bot';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firebaseConfig.js';
import { findProductoByMessage, isGenericCatalogRequest, buildCatalogListMessage } from './productos.service.js';

const REENVIO_REGEX = /(reenvia|otra vez|de nuevo|nuevamente|again|resend)/i;

let botInstance: CoreClass | null = null;

export function setCatalogoBot(bot: CoreClass): void {
  botInstance = bot;
}

/**
 * Deterministic catalog sending service
 * Returns true if a catalog was sent OR if catalog list was shown, false otherwise
 */
export async function intentarEnviarCatalogo(phone: string, text: string): Promise<boolean> {
  if (!botInstance) {
    console.warn('[catalogo] Bot instance not initialized');
    return false;
  }

  const provider = botInstance.provider;
  if (!provider) {
    console.warn('[catalogo] Provider not available');
    return false;
  }

  // Read current state
  const stateRef = db.collection('liveChatStates').doc(phone);
  const stateSnap = await stateRef.get();
  const state = stateSnap.exists ? stateSnap.data() : {};

  // Check if user wants to resend
  const wantsResend = REENVIO_REGEX.test(text);

  if (state?.catalogoEnviado === true && !wantsResend) {
    return false;
  }

  // Find matching product
  const producto = await findProductoByMessage(text);

  // If no exact match, check if it's a generic catalog request
  if (!producto) {
    if (isGenericCatalogRequest(text)) {
      console.log('[catalogo] Generic catalog request detected, listing available catalogs');
      const catalogList = await buildCatalogListMessage();

      if (catalogList) {
        // Send the catalog list
        await provider.sendMessage(phone, catalogList);

        // Log to liveChat
        await db.collection('liveChat').add({
          user: phone,
          text: catalogList,
          fileUrl: null,
          fileType: 'text',
          timestamp: FieldValue.serverTimestamp(),
          origen: 'bot',
        });

        // Update state to indicate catalog list was shown
        await stateRef.set({
          catalogoListaMostrada: true,
          estadoActual: 'DISCOVERY',
          state: 'DISCOVERY',
          ultimoIntent: 'lista_catalogos',
          last_intent: 'lista_catalogos',
          ultimoCambio: FieldValue.serverTimestamp(),
        }, { merge: true });

        return true;
      }
    }

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

  // Send via appropriate method based on product type
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
    console.error('[catalogo] Media send failed, falling back to text:', error);

    // Log send failure
    await db.collection('logs').doc('sendFailures').collection('entries').add({
      phone,
      payload: { tipo: producto.tipo, url: producto.url },
      error: error instanceof Error ? error.message : String(error),
      at: FieldValue.serverTimestamp(),
    });

    // Fallback to text
    await provider.sendMessage(phone, fallbackText);
    fileType = 'text';
    fileUrl = producto.url ?? null;
    loggedText = fallbackText;
  }

  // Log to liveChat
  await db.collection('liveChat').add({
    user: phone,
    text: loggedText,
    fileUrl,
    fileType,
    timestamp: FieldValue.serverTimestamp(),
    origen: 'bot',
  });

  // Update state with merged schemas (both handler and flow)
  const updatePayload = {
    catalogoEnviado: true,
    has_sent_catalog: true,
    catalogoRef: producto.keyword,
    estadoActual: 'CATALOGO_ENVIADO',
    state: 'CATALOG_SENT',
    ultimoIntent: 'catalogo',
    last_intent: 'catalogo',
    productoActual: producto.keyword,
    ultimoCambio: FieldValue.serverTimestamp(),
  };

  await stateRef.set(updatePayload, { merge: true });

  // Log state transition
  if (state?.estadoActual !== 'CATALOGO_ENVIADO') {
    await db.collection('logs').doc('stateTransitions').collection('entries').add({
      phone,
      from: state?.estadoActual ?? 'GREETING',
      to: 'CATALOGO_ENVIADO',
      intent: 'catalogo',
      at: FieldValue.serverTimestamp(),
    });
  }

  // Log catalog sent
  await db.collection('logs').doc('catalogSent').collection('entries').add({
    phone,
    catalogRef: producto.keyword,
    at: FieldValue.serverTimestamp(),
  });

  return true;
}
