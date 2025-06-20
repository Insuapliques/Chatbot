import { addKeyword } from '@builderbot/bot';
import { guardarCliente, obtenerCliente } from '../clienteService';
import { getChatGPTResponse } from '../aiService';
import { db } from '../firebaseConfig';
import { collection, doc } from 'firebase/firestore';
import { guardarMensajeEnLiveChat, guardarConversacionEnHistorial } from '../services/chatLogger';

const welcomeFlow = addKeyword([
  'iniciar', 'empezar', 'inicio', 'hola', 'buenas',
  'buenos días', 'buenas tardes', 'buenas noches'
]).addAction(async (ctx, { flowDynamic }) => {
  const nombre = await obtenerCliente(ctx.from);

  if (nombre) {
    await flowDynamic(`¡Hola ${nombre}! Bienvenido a *Isuapliques* 😊. Estoy aquí para ayudarte con información sobre apliques, estampados DTF y camisetas.`);
    return;
  }

  await flowDynamic("👋 ¡Hola! Bienvenido a *Isuapliques* 😊. Estoy aquí para ayudarte con información sobre apliques, estampados DTF y camisetas.");
  await flowDynamic("¿Te gustaría darme tu nombre para personalizar más la experiencia? Puedes escribir: *me llamo [tu nombre]*");
});

const registrarNombreFlow = addKeyword(['me llamo']).addAction(async (ctx, { flowDynamic }) => {
  const body = ctx.body.toLowerCase();
  if (!body.startsWith("me llamo")) return;

  const nombre = body.replace("me llamo", "").trim();
  if (nombre.length > 1) {
    await guardarCliente(ctx.from, nombre);
    await flowDynamic(`¡Gracias ${nombre}! ¿En qué puedo ayudarte hoy?`);
  }
});

const inteligenciaArtificialFlow = addKeyword([
  'dame informacion', 'camisetas', 'dtf', 'precio', 'valor', 'quiero',
  'cómo', 'información', 'necesito', 'personalización', 'devolución', 'enviar',
  '1', '2', '3', '4'
]).addAction(async (ctx, { flowDynamic }) => {
  const nombre = await obtenerCliente(ctx.from);
  if (!nombre) return;

  await guardarMensajeEnLiveChat(ctx);
  await guardarConversacionEnHistorial(ctx, ctx.body, "cliente");

  // 🛑 Verifica si está en modoHumano antes de responder
  const estadoDoc = await db.collection("liveChatStates").doc(ctx.from).get();
  const estado = estadoDoc.exists ? estadoDoc.data() : null;

  if (estado?.modoHumano) {
    console.log(`⛔ Usuario ${ctx.from} está siendo atendido por un humano. Bot no responde.`);
    return;
  }

  // 🤖 Detectar si el cliente solicita atención personalizada
  const textoCliente = ctx.body.toLowerCase();
  if (textoCliente.includes("atención personalizada") || textoCliente.includes("quiero hablar con alguien")) {
    await db.collection("solicitudesHumanas").doc(ctx.from).set({
      user: ctx.from,
      timestamp: new Date()
    });

    await db.collection("liveChatStates").doc(ctx.from).set({ modoHumano: true }, { merge: true });

    await guardarConversacionEnHistorial(ctx, "¡Claro! Ahora te paso con alguien del equipo 👩‍💻", "bot");
    await flowDynamic("¡Claro! Ahora te paso con alguien del equipo 👩‍💻");
    return;
  }

  // 🧾 Modo cierre (menú)
  if (estado?.estado === "cierre") {
    switch (ctx.body.trim()) {
      case "1":
        await flowDynamic("🛒 Aquí está el catálogo: [enlace o listado]");
        break;
      case "2":
        await flowDynamic("✍️ ¡Claro! Cuéntame qué quieres personalizar.");
        break;
      case "3":
        await db.collection("liveChatStates").doc(ctx.from).delete();
        await flowDynamic("🔁 Reiniciando... ¿Cómo te llamas?");
        break;
      case "4":
        await db.collection("liveChatStates").doc(ctx.from).delete();
        await flowDynamic("❌ Gracias por tu tiempo. ¡Hasta pronto! 👋");
        break;
      default:
        await flowDynamic("Por favor responde con 1, 2, 3 o 4 🙏");
    }
    return;
  }

  // 3. Revisar si hay coincidencia con productos multimedia
const productosSnap = await db.collection("productos_chatbot").get();
for (const docProd of productosSnap.docs) {
  const { keyword, respuesta, tipo, url } = docProd.data();
  if (keyword && ctx.body.toLowerCase().includes(keyword.toLowerCase())) {
    const mensaje = respuesta || "📎 Aquí tienes el recurso solicitado";

    await guardarConversacionEnHistorial(ctx, mensaje, "bot");

if (["pdf", "imagen", "video"].includes(tipo)) {
  await flowDynamic([{ body: mensaje, media: url }]); // sin 'type'
}
else {
  await flowDynamic(mensaje); // Texto simple
}

    return; // 🛑 No ejecuta la IA si ya encontró coincidencia
  }
}

  // ✨ Procesamiento de IA
  const { text: respuesta, isClosing } = await getChatGPTResponse(ctx.body);
  await guardarConversacionEnHistorial(ctx, respuesta, "bot");
  await flowDynamic(respuesta || "Lo siento, ¿puedes repetirlo de otra forma?");
  await db.collection("liveChatStates").doc(ctx.from).set({ modoHumano: false }, { merge: true });
  // 🔄 Reiniciar estado de cierre si no aplica

  // 🔚 Activar menú de cierre si aplica
  if (isClosing) {
    await flowDynamic(
      "✅ Gracias por conversar con Isuapliques. ¿Quieres hacer algo más?\n\n" +
      "1. 🛒 Ver catálogo\n" +
      "2. ✍️ Personalizar un producto\n" +
      "3. 🔁 Empezar de nuevo\n" +
      "4. ❌ Salir"
    );
    await db.collection("liveChatStates").doc(ctx.from).set({ estado: "cierre" }, { merge: true });
  }
});

export {
  welcomeFlow,
  registrarNombreFlow,
  inteligenciaArtificialFlow
};





