import * as dotenv from 'dotenv';
import { createBot, createProvider } from '@builderbot/bot';
import { MemoryDB as Database } from '@builderbot/bot';
import { MetaProvider as Provider } from '@builderbot/provider-meta';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import trainingRoutes from '../routes/trainingRoutes';
import conversationRoutes from '../routes/conversationRoutes';
import { main as flow } from './flows';
import { db } from './firebaseConfig';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import { disableHandoff, enableHandoff, operatorReply } from './services/liveChatService';
import type { OperatorInfo } from './services/liveChatService';



dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/conversations', conversationRoutes);
app.use('/api/training', trainingRoutes);


const PORT = process.env.PORT || 3008;
const LIVECHAT_TOKEN = process.env.LIVECHAT_TOKEN || process.env.LIVECHAT_API_KEY || process.env.LIVECHAT_SECRET;

const ensureAuthorized = (req: Request, res: Response): boolean => {
  if (!LIVECHAT_TOKEN) {
    res.status(500).json({ error: 'LIVECHAT_TOKEN no configurado' });
    return false;
  }

  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const tokenFromAuth = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  const apiKeyHeader = req.headers['x-api-key'];
  const tokenFromHeader = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

  if (tokenFromAuth === LIVECHAT_TOKEN || tokenFromHeader === LIVECHAT_TOKEN) {
    return true;
  }

  res.status(401).json({ error: 'No autorizado' });
  return false;
};

// ✅ GET para verificación inicial del webhook
app.get("/webhook", (req, res) => {
  const verifyToken = process.env.verifyToken || "webhooksecret123";
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token && mode === "subscribe" && token === verifyToken) {
    console.log("✅ Webhook verificado correctamente");
    res.status(200).send(challenge);
  } else {
    console.log("❌ Falló la verificación del webhook");
    res.sendStatus(403);
  }
});

// ✅ POST desde WhatsApp: recibe mensajes y media
app.post("/webhook", async (req, res) => {
  const body = req.body;

  try {
    const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const from = message?.from;
    const type = message?.type;

    if (!message || !from) {
      res.sendStatus(200);
      return;
    }

    if (type === "text" && message.text?.body) {
      await db.collection("liveChat").add({
        user: from,
        text: message.text.body,
        fileUrl: null,
        fileType: "text",
        timestamp: FieldValue.serverTimestamp(),
        origen: "cliente",
      });

      res.sendStatus(200);
      return;
    }

    if (type === "image" && message.image?.id) {
      const url = await downloadAndUploadToFirebase(message.image.id, "image/jpeg", "jpg");
      await db.collection("liveChat").add({
        user: from,
        text: "",
        fileUrl: url,
        fileType: "image",
        timestamp: FieldValue.serverTimestamp(),
        origen: "cliente",
      });
      res.sendStatus(200);
      return;
    }

    if (type === "audio" && message.audio?.id) {
      const url = await downloadAndUploadToFirebase(message.audio.id, "audio/ogg", "ogg");
      await db.collection("liveChat").add({
        user: from,
        text: "",
        fileUrl: url,
        fileType: "audio",
        timestamp: FieldValue.serverTimestamp(),
        origen: "cliente",
      });
      res.sendStatus(200);
      return;
    }

    if (type === "document" && message.document?.id) {
      const url = await downloadAndUploadToFirebase(message.document.id, "application/pdf", "pdf");
      await db.collection("liveChat").add({
        user: from,
        text: "",
        fileUrl: url,
        fileType: "document",
        timestamp: FieldValue.serverTimestamp(),
        origen: "cliente",
      });
      res.sendStatus(200);
      return;
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error en webhook:", err);
    res.sendStatus(500);
  }
});

const main = async () => {
  const adapterDB = new Database();
  const adapterFlow = flow;
  const adapterProvider = createProvider(Provider, {
    jwtToken: process.env.jwtToken,
    numberId: process.env.numberId,
    verifyToken: process.env.verifyToken,
    version: 'v22.0',
  });

  const { handleCtx, httpServer } = await createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB,
  });

  // ✅ Envío manual desde consola (operador)
  adapterProvider.server.post('/v1/live/enable', handleCtx(async (_bot, req, res) => {
    if (!ensureAuthorized(req, res)) {
      return;
    }

    const { number, operatorId, operatorName, reason, metadata } = req.body ?? {};

    if (!number) {
      res.status(400).json({ error: 'number es requerido' });
      return;
    }

    try {
      const operatorInfo: OperatorInfo | undefined = operatorId || operatorName
        ? { id: operatorId ?? null, name: operatorName ?? null }
        : undefined;

      const metadataPayload = typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
        ? metadata as Record<string, unknown>
        : undefined;

      await enableHandoff({
        userId: number,
        operator: operatorInfo,
        reason: reason ?? 'habilitado_por_operador',
        metadata: metadataPayload,
      });

      res.json({ status: 'modoHumano_habilitado' });
    } catch (error) {
      console.error('❌ Error habilitando modo humano:', error);
      res.status(500).json({ error: 'Error habilitando modo humano' });
    }
  }));

  adapterProvider.server.post('/v1/live/disable', handleCtx(async (_bot, req, res) => {
    if (!ensureAuthorized(req, res)) {
      return;
    }

    const { number, operatorId, operatorName, reason } = req.body ?? {};

    if (!number) {
      res.status(400).json({ error: 'number es requerido' });
      return;
    }

    try {
      const operatorInfo: OperatorInfo | undefined = operatorId || operatorName
        ? { id: operatorId ?? null, name: operatorName ?? null }
        : undefined;

      await disableHandoff({
        userId: number,
        operator: operatorInfo,
        reason: reason ?? 'deshabilitado_por_operador',
      });

      res.json({ status: 'modoHumano_deshabilitado' });
    } catch (error) {
      console.error('❌ Error deshabilitando modo humano:', error);
      res.status(500).json({ error: 'Error deshabilitando modo humano' });
    }
  }));

  adapterProvider.server.post('/v1/live/reply', handleCtx(async (bot, req, res) => {
    if (!ensureAuthorized(req, res)) {
      return;
    }

    const { number, message, urlMedia, mediaType, operatorId, operatorName } = req.body ?? {};

    if (!number) {
      res.status(400).json({ error: 'number es requerido' });
      return;
    }

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message es requerido y debe ser texto' });
      return;
    }

    try {
      await bot.sendMessage(number, message, {
        media: urlMedia ?? null,
      });

      await operatorReply({
        userId: number,
        operator: { id: operatorId ?? null, name: operatorName ?? null },
        message,
        mediaUrl: urlMedia ?? null,
        mediaType: mediaType ?? null,
      });

      res.json({ status: 'enviado' });
    } catch (error) {
      console.error('❌ Error enviando respuesta del operador:', error);
      res.status(500).json({ error: 'Error enviando respuesta del operador' });
    }
  }));

  adapterProvider.server.post('/v1/messages', handleCtx(async (bot, req, res) => {
    const { number, message, urlMedia } = req.body;

    const chatStateRef = db.collection("liveChatStates").doc(number);
    const chatStateSnap = await chatStateRef.get();

    if (chatStateSnap.exists && chatStateSnap.data()?.modoHumano === true) {
      console.log(`🟡 Usuario ${number} está siendo atendido por un humano. No responder con IA.`);
      return res.status(200).json({ status: "modoHumano_activo" });
    }

    if (!number || !message) {
      return res.end(JSON.stringify({ error: "Faltan datos" }));
    }

    try {
      await bot.sendMessage(number, message, {
        media: urlMedia ?? null
      });

      await db.collection('liveChat').add({
        user: number,
        text: message,
        fileUrl: urlMedia ?? null,
        fileType: urlMedia ? 'file' : 'text',
        timestamp: FieldValue.serverTimestamp(),
        origen: "operador"
      });

      res.end(JSON.stringify({ status: 'enviado' }));
    } catch (error) {
      console.error("❌ Error enviando mensaje desde operador:", error);
      res.end(JSON.stringify({ error: "Error interno al enviar mensaje" }));
    }
  }));


  httpServer(+PORT);
};

main();

// 🔧 Funciones auxiliares
async function getWhatsAppMediaUrl(mediaId: string): Promise<string> {
  const response = await fetch(`https://graph.facebook.com/v17.0/${mediaId}`, {
    headers: {
      Authorization: `Bearer ${process.env.jwtToken}`,
    },
  });
  const data = (await response.json()) as { url: string };
  return data.url;
}

async function fetchMediaBuffer(mediaUrl: string): Promise<Buffer> {
  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Bearer ${process.env.jwtToken}`,
    },
  });
  return await response.buffer();
}

async function downloadAndUploadToFirebase(mediaId: string, contentType: string, ext: string): Promise<string> {
  const mediaUrl = await getWhatsAppMediaUrl(mediaId);
  const buffer = await fetchMediaBuffer(mediaUrl);
  const fileName = `liveChat/${Date.now()}_${uuidv4()}.${ext}`;

  const bucket = getStorage().bucket();
  const file = bucket.file(fileName);
  await file.save(buffer, { contentType });

  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: "03-01-2030",
  });

  return signedUrl;
}