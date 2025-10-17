import { Router, Request, Response } from 'express';
import { db } from '../src/firebaseConfig.js';
import { FieldValue } from 'firebase-admin/firestore';

const router = Router();

// Variable para almacenar la función sendText inyectada
let sendTextFn: ((phone: string, text: string) => Promise<void>) | null = null;

/**
 * Inyecta la función sendText del provider
 */
export function setSendTextFunction(fn: (phone: string, text: string) => Promise<void>) {
  sendTextFn = fn;
}

/**
 * GET /panel/conversations
 * Obtiene todas las conversaciones activas con información del último mensaje
 */
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const limit = Number.parseInt(req.query.limit as string) || 50;

    // Obtener conversaciones activas (últimas 24 horas por defecto)
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    const statesSnapshot = await db
      .collection('liveChatStates')
      .where('ultimoContacto', '>=', oneDayAgo)
      .orderBy('ultimoContacto', 'desc')
      .limit(limit)
      .get();

    const conversations = await Promise.all(
      statesSnapshot.docs.map(async (doc) => {
        const state = doc.data();
        const phone = doc.id;

        // Obtener último mensaje
        const lastMessageSnapshot = await db
          .collection('liveChat')
          .where('user', '==', phone)
          .orderBy('timestamp', 'desc')
          .limit(1)
          .get();

        const lastMessage = lastMessageSnapshot.empty
          ? null
          : {
              text: lastMessageSnapshot.docs[0].data().text,
              timestamp: lastMessageSnapshot.docs[0].data().timestamp?.toDate(),
              origen: lastMessageSnapshot.docs[0].data().origen,
            };

        // Contar mensajes no leídos (mensajes del cliente sin respuesta del operador después)
        const unreadSnapshot = await db
          .collection('liveChat')
          .where('user', '==', phone)
          .where('origen', '==', 'cliente')
          .orderBy('timestamp', 'desc')
          .limit(10)
          .get();

        let unreadCount = 0;
        if (!unreadSnapshot.empty) {
          const lastClientMessage = unreadSnapshot.docs[0];
          const afterClientSnapshot = await db
            .collection('liveChat')
            .where('user', '==', phone)
            .where('timestamp', '>', lastClientMessage.data().timestamp)
            .where('origen', '==', 'operador')
            .limit(1)
            .get();

          unreadCount = afterClientSnapshot.empty ? 1 : 0;
        }

        return {
          phone,
          estadoActual: state.estadoActual || 'DISCOVERY',
          modoHumano: state.modoHumano || false,
          productoActual: state.productoActual || null,
          catalogoEnviado: state.catalogoEnviado || false,
          pedidoEnProceso: state.pedidoEnProceso || false,
          ultimoContacto: state.ultimoContacto?.toDate(),
          lastMessage,
          unreadCount,
        };
      })
    );

    res.json({
      success: true,
      data: {
        conversations,
        total: conversations.length,
      },
    });
  } catch (error) {
    console.error('Error obteniendo conversaciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al obtener conversaciones',
    });
  }
});

/**
 * POST /panel/takeover/:phone
 * Toma control de una conversación (activa modo humano)
 */
router.post('/takeover/:phone', async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;

    if (!phone) {
      res.status(400).json({
        success: false,
        error: 'El número de teléfono es obligatorio',
      });
      return;
    }

    // Actualizar estado para activar modo humano
    await db
      .collection('liveChatStates')
      .doc(phone)
      .set(
        {
          modoHumano: true,
          ultimoContacto: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    // Registrar la acción en logs
    await db
      .collection('logs')
      .doc('humanTakeover')
      .collection('entries')
      .add({
        phone,
        action: 'takeover',
        timestamp: FieldValue.serverTimestamp(),
      });

    res.json({
      success: true,
      message: 'Control tomado exitosamente',
      phone,
      modoHumano: true,
    });
  } catch (error) {
    console.error('Error tomando control:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al tomar control',
    });
  }
});

/**
 * POST /panel/release/:phone
 * Libera el control de una conversación (desactiva modo humano)
 */
router.post('/release/:phone', async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;

    if (!phone) {
      res.status(400).json({
        success: false,
        error: 'El número de teléfono es obligatorio',
      });
      return;
    }

    // Actualizar estado para desactivar modo humano
    await db
      .collection('liveChatStates')
      .doc(phone)
      .set(
        {
          modoHumano: false,
          ultimoContacto: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    // Registrar la acción en logs
    await db
      .collection('logs')
      .doc('humanTakeover')
      .collection('entries')
      .add({
        phone,
        action: 'release',
        timestamp: FieldValue.serverTimestamp(),
      });

    res.json({
      success: true,
      message: 'Control liberado exitosamente',
      phone,
      modoHumano: false,
    });
  } catch (error) {
    console.error('Error liberando control:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al liberar control',
    });
  }
});

/**
 * POST /panel/send
 * Envía un mensaje como operador (solo funciona cuando modoHumano está activo)
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { phone, text } = req.body ?? {};

    if (!phone || !text) {
      res.status(400).json({
        success: false,
        error: 'phone y text son obligatorios',
      });
      return;
    }

    if (!sendTextFn) {
      res.status(500).json({
        success: false,
        error: 'Función de envío no inicializada',
      });
      return;
    }

    // Verificar que modo humano esté activo
    const chatStateSnap = await db.collection('liveChatStates').doc(phone).get();
    if (!chatStateSnap.exists || chatStateSnap.data()?.modoHumano !== true) {
      res.status(403).json({
        success: false,
        error: 'Debes tomar control de la conversación primero',
      });
      return;
    }

    // Enviar mensaje
    await sendTextFn(phone, text);

    // Guardar en historial
    await db.collection('liveChat').add({
      user: phone,
      text,
      fileUrl: null,
      fileType: 'text',
      timestamp: FieldValue.serverTimestamp(),
      origen: 'operador',
    });

    res.json({
      success: true,
      message: 'Mensaje enviado exitosamente',
    });
  } catch (error) {
    console.error('Error enviando mensaje desde panel:', error);
    await db
      .collection('logs')
      .doc('sendFailures')
      .collection('entries')
      .add({
        phone: req.body?.phone,
        text: req.body?.text,
        at: FieldValue.serverTimestamp(),
        error: error instanceof Error ? error.message : String(error),
      });
    res.status(500).json({
      success: false,
      error: 'Error interno al enviar mensaje',
    });
  }
});

/**
 * GET /panel/messages/:phone
 * Obtiene el historial de mensajes de una conversación específica
 */
router.get('/messages/:phone', async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    const limit = Number.parseInt(req.query.limit as string) || 50;

    if (!phone) {
      res.status(400).json({
        success: false,
        error: 'El número de teléfono es obligatorio',
      });
      return;
    }

    const messagesSnapshot = await db
      .collection('liveChat')
      .where('user', '==', phone)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    const messages = messagesSnapshot.docs.map((doc) => ({
      id: doc.id,
      text: doc.data().text,
      fileUrl: doc.data().fileUrl,
      fileType: doc.data().fileType,
      origen: doc.data().origen,
      timestamp: doc.data().timestamp?.toDate(),
    }));

    // Invertir para que estén en orden cronológico ascendente
    messages.reverse();

    res.json({
      success: true,
      data: {
        phone,
        messages,
        count: messages.length,
      },
    });
  } catch (error) {
    console.error('Error obteniendo mensajes:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al obtener mensajes',
    });
  }
});

/**
 * GET /panel/status/:phone
 * Obtiene el estado actual de una conversación
 */
router.get('/status/:phone', async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;

    if (!phone) {
      res.status(400).json({
        success: false,
        error: 'El número de teléfono es obligatorio',
      });
      return;
    }

    const stateDoc = await db.collection('liveChatStates').doc(phone).get();

    if (!stateDoc.exists) {
      res.json({
        success: true,
        data: {
          phone,
          exists: false,
          modoHumano: false,
        },
      });
      return;
    }

    const state = stateDoc.data();

    res.json({
      success: true,
      data: {
        phone,
        exists: true,
        modoHumano: state?.modoHumano || false,
        estadoActual: state?.estadoActual || 'DISCOVERY',
        productoActual: state?.productoActual || null,
        catalogoEnviado: state?.catalogoEnviado || false,
        pedidoEnProceso: state?.pedidoEnProceso || false,
        ultimoContacto: state?.ultimoContacto?.toDate(),
      },
    });
  } catch (error) {
    console.error('Error obteniendo estado:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al obtener estado',
    });
  }
});

export default router;
