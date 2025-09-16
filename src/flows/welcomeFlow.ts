//este es un archivo de flujo de bienvenida para un chatbot
// que maneja la interacción inicial con el usuario, registra su nombre,
// y proporciona respuestas automatizadas basadas en palabras clave y productos mencionados.
import { addKeyword } from '@builderbot/bot';
import { guardarCliente, obtenerCliente } from '../clienteService';
import { getChatGPTResponse } from '../aiService';
import { db } from '../firebaseConfig';
import { guardarMensajeEnLiveChat, guardarConversacionEnHistorial } from '../services/chatLogger';
import { extraerProductoDelMensaje } from '../utils/extraerProductoDelMensaje';
import { getProductoDesdeXLSX } from '~/utils/getProductoDesdeXLSX';

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

  if (estado?.modoHumano) {
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

  const productosSnap = await db.collection("productos_chatbot").get();
  for (const docProd of productosSnap.docs) {
    const { keyword, respuesta, tipo, url } = docProd.data();
    if (keyword && ctx.body.toLowerCase().includes(keyword.toLowerCase())) {
      const mensaje = respuesta || await getMensaje("recursoGenerico");
      await guardarConversacionEnHistorial(ctx, mensaje, "bot");

      if (["pdf", "imagen", "video"].includes(tipo)) {
        await flowDynamic([{ body: mensaje, media: url }]);
      } else {
        await flowDynamic(mensaje);
      }
      return;
    }
  }

  const productoDetectado = extraerProductoDelMensaje(ctx.body);
  if (productoDetectado) {
    const detalle = await getProductoDesdeXLSX(productoDetectado);
    if (detalle) {
      await guardarConversacionEnHistorial(ctx, detalle, "bot");
      await flowDynamic(detalle);
      return;
    }
  }

  const { text: respuesta, isClosing } = await getChatGPTResponse(
    ctx.body,
    ctx.from
  );
  await guardarConversacionEnHistorial(ctx, respuesta, "bot");
  await flowDynamic(respuesta || "Lo siento, ¿puedes repetirlo de otra forma?");
  await db.collection("liveChatStates").doc(ctx.from).set({ modoHumano: false }, { merge: true });

  if (isClosing) {
    const menu = await getMensaje("cierreMenuFinal");
    await flowDynamic(menu);
    await db.collection("liveChatStates").doc(ctx.from).set({ estado: "cierre" }, { merge: true });
  }
});

export {
  welcomeFlow,
  registrarNombreFlow,
  inteligenciaArtificialFlow
};
