// src/services/chatLogger.ts
import { db } from '../firebaseConfig.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';


export async function guardarMensajeEnLiveChat(ctx, origen = "cliente") {
  try {
    await db.collection('liveChat').add({
      user: ctx.from,
      text: ctx.body,
      fileUrl: null,
      fileType: 'text',
      timestamp: FieldValue.serverTimestamp(),
      origen // "cliente" o "operador"
    });
  } catch (error) {
    console.error('❌ Error al guardar mensaje en liveChat:', error);
  }
}

export async function guardarConversacionEnHistorial(ctx, texto: string, quien: "bot" | "cliente") {
  try {
    const ref = db.collection("conversations").doc(ctx.from);
    const snap = await ref.get();

    const nuevoMensaje = {
      text: texto,
      from: quien,
      timestamp: Timestamp.now() // ✅ evitar FieldValue.serverTimestamp() dentro del array
    };

    if (snap.exists) {
      await ref.update({
        messages: FieldValue.arrayUnion(nuevoMensaje),
        timestamp: FieldValue.serverTimestamp() // ✅ este sí se puede fuera del array
      });
    } else {
      await ref.set({
        user: ctx.from,
        messages: [nuevoMensaje],
        timestamp: FieldValue.serverTimestamp()
      });
    }
  } catch (err) {
    console.error("❌ Error guardando historial de conversación:", err);
  }
}