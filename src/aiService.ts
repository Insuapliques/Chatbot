import dotenv from "dotenv";
dotenv.config();

import { db } from "./firebaseConfig";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const getChatGPTResponse = async (
  userMessage: string,
  userId: string
): Promise<{ text: string; isClosing: boolean }> => {
  try {
    const configSnap = await db.collection("settings").doc("prompts").get();
    const config = configSnap.exists ? configSnap.data() : {};

    const basePrompt =
      config?.entrenamiento_base || "Actúa como un asistente de ventas.";
    const palabraCierre = config?.palabra_cierre || "Lead en Proceso";

    const conversationSnap = await db.collection("conversations").doc(userId).get();
    const conversationData = conversationSnap.data();
    const storedMessages =
      conversationSnap.exists && Array.isArray(conversationData?.messages)
        ? conversationData.messages
        : [];

    const historyMessages = storedMessages
      .filter(
        (message: any) =>
          message && typeof message.text === "string" && message.text.trim().length > 0
      )
      .sort((a: any, b: any) => {
        const getMillis = (msg: any) => {
          const { timestamp } = msg || {};
          if (timestamp && typeof timestamp.toMillis === "function") {
            return timestamp.toMillis();
          }
          if (timestamp && typeof timestamp === "object") {
            const seconds =
              ("seconds" in timestamp ? timestamp.seconds : undefined) ??
              ("_seconds" in timestamp ? timestamp._seconds : undefined) ??
              0;
            const nanoseconds =
              ("nanoseconds" in timestamp ? timestamp.nanoseconds : undefined) ??
              ("_nanoseconds" in timestamp ? timestamp._nanoseconds : undefined) ??
              0;
            return seconds * 1000 + Math.floor(nanoseconds / 1_000_000);
          }
          return 0;
        };

        return getMillis(a) - getMillis(b);
      })
      .map((message: any) => ({
        role: message.from === "bot" ? "assistant" : "user",
        content: message.text,
      }));

    const messages = [
      { role: "system", content: basePrompt },
      ...historyMessages,
    ];

    const lastHistoryMessage = historyMessages[historyMessages.length - 1];
    if (
      !lastHistoryMessage ||
      lastHistoryMessage.role !== "user" ||
      lastHistoryMessage.content !== userMessage
    ) {
      messages.push({ role: "user", content: userMessage });
    }

    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
    });

    const respuesta = chatCompletion.choices[0].message.content || "";
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

