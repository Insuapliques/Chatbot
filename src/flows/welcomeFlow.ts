//este es un archivo de flujo de bienvenida para un chatbot
// que maneja la interacción inicial con el usuario, registra su nombre,
// y proporciona respuestas automatizadas basadas en palabras clave y productos mencionados.
import { addKeyword } from '@builderbot/bot';
import { guardarCliente, obtenerCliente } from '../clienteService.js';
import { executeAgent } from '../services/agentService.js';
import { ensurePromptConfig } from '../services/promptManager.js';
import { getState } from '../services/stateManager.js';

import { db } from '../firebaseConfig.js';
import { guardarMensajeEnLiveChat, guardarConversacionEnHistorial } from '../services/chatLogger.js';
import { extraerProductoDelMensaje } from '../utils/extraerProductoDelMensaje.js';
import { getProductoDesdeXLSX } from '~/utils/getProductoDesdeXLSX.js';

// 🔧 Cargar mensajes desde Firestore y reemplazar {{nombre}} si aplica
async function getMensaje(tipo: string, nombre?: string): Promise<string> {
  const docSnap = await db.collection("settings").doc("welcome_messages").get();
  const mensajes = docSnap.exists ? docSnap.data() : {};
  let plantilla = mensajes?.[tipo] || "";
  if (nombre) {
    plantilla = plantilla.replace(/{{nombre}}/gi, nombre);
  }
  return plantilla;
}

const welcomeFlow = addKeyword([
  'iniciar', 'empezar', 'inicio', 'hola', 'buenas',
  'buenos días', 'buenas tardes', 'buenas noches'
]).addAction(async (ctx, { flowDynamic }) => {
  const nombre = await obtenerCliente(ctx.from);
  if (nombre) {
    await flowDynamic(await getMensaje("saludoConNombre", nombre));
  } else {
    await flowDynamic(await getMensaje("saludoSinNombre"));
    await flowDynamic(await getMensaje("pedirNombre"));
  }
});

// Flujo para registrar el nombre del usuario
const registrarNombreFlow = addKeyword(['me llamo']).addAction(async (ctx, { flowDynamic, endFlow }) => {
  const body = ctx.body.trim().toLowerCase();

  // Extraer nombre si usa "me llamo"
  let nombre = "";
  if (body.startsWith("me llamo")) {
    nombre = body.replace("me llamo", "").trim();
  } else if (/^[a-záéíóúñ\s]{2,30}$/i.test(ctx.body.trim())) {
    // Si el mensaje no tiene "me llamo" pero parece un nombre (sin números, sin símbolos)
    nombre = ctx.body.trim();
  }

  if (nombre.length > 1) {
    await guardarCliente(ctx.from, nombre);
    await flowDynamic(await getMensaje("agradecerNombre", nombre));
    return endFlow();
  }

  // No guarda si no parece nombre válido
  return;
});


// Flujo de inteligencia artificial para responder preguntas y manejar interacciones
const inteligenciaArtificialFlow = addKeyword([
  'dame informacion', 'camisetas', 'dtf', 'precio', 'valor', 'quiero',
  'cómo', 'información', 'necesito', 'personalización', 'devolución', 'enviar',
  '1', '2', '3', '4'
]).addAction(async (ctx, { flowDynamic }) => {
  const nombre = await obtenerCliente(ctx.from);
  if (!nombre) return;

  await guardarMensajeEnLiveChat(ctx);
  await guardarConversacionEnHistorial(ctx, ctx.body, "cliente");

  const estadoDoc = await db.collection("liveChatStates").doc(ctx.from).get();
  const estado = estadoDoc.exists ? estadoDoc.data() : null;

  // Check modoHumano flag (supports both schema formats)
  if (estado?.modoHumano === true) {
    console.log(`⛔ Usuario ${ctx.from} está siendo atendido por un humano.`);
    return;
  }

  const textoCliente = ctx.body.toLowerCase();
  if (textoCliente.includes("atención personalizada") || textoCliente.includes("quiero hablar con alguien")) {
    await db.collection("solicitudesHumanas").doc(ctx.from).set({
      user: ctx.from,
      timestamp: new Date()
    });

    await db.collection("liveChatStates").doc(ctx.from).set({ modoHumano: true }, { merge: true });

    const mensaje = await getMensaje("atencionHumana");
    await guardarConversacionEnHistorial(ctx, mensaje, "bot");
    await flowDynamic(mensaje);
    return;
  }

  if (estado?.estado === "cierre") {
    const opcion = ctx.body.trim();
    switch (opcion) {
      case "1":
        await flowDynamic(await getMensaje("cierreOpcion1"));
        break;
      case "2":
        await flowDynamic(await getMensaje("cierreOpcion2"));
        break;
      case "3":
        await db.collection("liveChatStates").doc(ctx.from).delete();
        await flowDynamic(await getMensaje("cierreOpcion3"));
        break;
      case "4":
        await db.collection("liveChatStates").doc(ctx.from).delete();
        await flowDynamic(await getMensaje("cierreOpcion4"));
        break;
      default:
        await flowDynamic(await getMensaje("cierreDefault"));
    }
    return;
  }

  // NOTE: Catalog sending is handled EXCLUSIVELY by the deterministic catalog service
  // in catalogo.service.ts. Do NOT attempt to send catalogs here to avoid duplicate sends
  // and false positives. The custom handler intercepts messages BEFORE flows.

  const productoDetectado = extraerProductoDelMensaje(ctx.body);
  if (productoDetectado) {
    const detalle = await getProductoDesdeXLSX(productoDetectado);
    if (detalle) {
      await guardarConversacionEnHistorial(ctx, detalle, "bot");
      await flowDynamic(detalle);
      return;
    }
  }

  try {
    await ensurePromptConfig();
    const state = await getState(ctx.from);

    // Merge both state schemas to ensure compatibility
    const mergedHasSentCatalog = Boolean(
      state?.has_sent_catalog ??
      estado?.has_sent_catalog ??
      estado?.catalogoEnviado
    );

    const mergedState =
      state?.state ??
      estado?.state ??
      estado?.estadoActual ??
      undefined;

    const mergedLastIntent =
      state?.last_intent ??
      estado?.last_intent ??
      estado?.ultimoIntent ??
      undefined;

    // Use agentService with automatic conversation history loading and function calling
    const agentResponse = await executeAgent({
      phone: ctx.from,
      userMessage: ctx.body,
      // conversationHistory is loaded automatically from liveChat
    });

    const mensaje =
      agentResponse.text || "Lo siento, ¿puedes repetirlo de otra forma?";

    // Log tool calls for debugging
    if (agentResponse.toolCalls && agentResponse.toolCalls.length > 0) {
      console.log(`[welcomeFlow] 🛠️ Agent used ${agentResponse.toolCalls.length} tool(s):`,
        agentResponse.toolCalls.map(t => `${t.toolName}(${JSON.stringify(t.arguments)})`).join(', ')
      );
    }

    await guardarConversacionEnHistorial(ctx, mensaje, "bot");
    await flowDynamic(mensaje);
    await db
      .collection("liveChatStates")
      .doc(ctx.from)
      .set(
        {
          modoHumano: false,
          lastAiLatencyMs: agentResponse.latencyMs,
          lastAiUsedFallback: agentResponse.usedFallback,
        },
        { merge: true },
      );

    if (agentResponse.usedFallback) {
      console.warn('⚠️ Fallback IA utilizado para la última respuesta.');
    }

    if (agentResponse.error) {
      console.error('⚠️ Error en agentService:', agentResponse.error);
    }

    // Note: agentService doesn't have closingTriggered like aiService
    // Closing logic can be handled by the transferirAAsesor tool or manually
  } catch (error) {
    console.error("❌ Error obteniendo respuesta IA:", error);
    const fallbackMensaje =
      "Ahora mismo no puedo responder. Por favor, intenta de nuevo en unos instantes.";
    await guardarConversacionEnHistorial(ctx, fallbackMensaje, "bot");
    await flowDynamic(fallbackMensaje);
  }
});

export {
  welcomeFlow,
  registrarNombreFlow,
  inteligenciaArtificialFlow
};
