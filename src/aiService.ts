import dotenv from "dotenv";
dotenv.config();

import { db } from "./firebaseConfig";
import OpenAI from "openai";

// 🔧 FALTA ESTO PARA USAR Firestore
import { collection, getDocs } from "firebase/firestore";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const getChatGPTResponse = async (
  userMessage: string
): Promise<{ text: string; isClosing: boolean }> => {
  try {
    const configSnap = await db.collection("settings").doc("prompts").get();
    const config = configSnap.exists ? configSnap.data() : {};

    const basePrompt =
      config?.entrenamiento_base || "Actúa como un asistente de ventas.";
    const palabraCierre = config?.palabra_cierre || "Lead en Proceso";

    const inputSegments = [
      { role: "system", content: basePrompt },
      { role: "user", content: userMessage },
    ];

    const response = await openai.responses.create({
      model: "gpt-5",
      input: inputSegments,
    });

    const respuesta = response.output_text ?? "";
    const isClosing = respuesta
      .toLowerCase()
      .includes(palabraCierre.toLowerCase());

    return { text: respuesta, isClosing };
  } catch (error) {
    console.error("❌ Error generando respuesta:", error);
    return {
      text: "Hubo un problema generando la respuesta.",
      isClosing: false,
    };
  }
};

// ✅ FUNCIÓN AGREGADA CORRECTAMENTE
export const buscarProductoChatbot = async (mensaje: string) => {
  const snapshot = await db.collection("productos_chatbot").get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const keywords = Array.isArray(data.keyword) ? data.keyword : [data.keyword];
    const match = keywords.some((palabra: string) =>
      mensaje.toLowerCase().includes(palabra.toLowerCase())
    );
    if (match) {
      return {
        respuesta: data.respuesta || "",
        tipo: data.tipo || "imagen",
        url: data.url || "",
      };
    }
  }

  return null;
};

