import { addKeyword } from '@builderbot/bot';
import { db } from '../firebaseConfig';
import { enableHandoff } from '../services/liveChatService';

export const asesorHumanoFlow = addKeyword([ 'quiero hablar con alguien', 'asesor humano', 'atención personalizada', 'prefiero hablar con alguien directamente', 'necesito un humano', 'hablar con asesor', 'quiero atención de una persona'
])
  .addAnswer('😊 ¡Claro que sí! Ya mismo te comunico con uno de nuestros asesores.')
  .addAction(async (ctx, { flowDynamic }) => {
    const { from } = ctx;

    // Marcar solicitud en Firestore
    await db.collection('solicitudesHumanas').doc(from).set({
      user: from,
      timestamp: new Date(),
      status: 'pendiente'
    });

    await enableHandoff({
      userId: from,
      reason: 'solicitud_usuario',
      metadata: {
        estadoSolicitud: 'pendiente'
      }
    });

    await flowDynamic('🕐 Un asesor se pondrá en contacto contigo pronto.');
  });

