import 'dotenv/config';
import { createBot, createProvider } from '@builderbot/bot';
import { MemoryDB as Database } from '@builderbot/bot';
import { MetaProvider as Provider } from '@builderbot/provider-meta';
import express from 'express';
import cors, { CorsOptions } from 'cors';
import trainingRoutes from '../routes/trainingRoutes.js';
import conversationRoutes from '../routes/conversationRoutes.js';
import userRoutes from '../routes/userRoutes.js';
import { main as flow } from './flows.js';
import { db } from './firebaseConfig.js';
import { FieldValue } from 'firebase-admin/firestore';
import { auditAccess, authenticateRequest } from './middleware/security.js';
import { createConversationHandler, MetaMessageCtx } from './conversation/handler.js';
import { setCatalogoBot } from './services/catalogo.service.js';

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    console.warn(`Solicitud bloqueada por CORS desde origen no autorizado: ${origin}`);
    callback(new Error('Origen no autorizado por CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Api-Key', 'X-Service-Token'],
  exposedHeaders: ['X-Request-Id'],
  credentials: true,
  maxAge: 60 * 60,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use('/api/conversations', auditAccess, authenticateRequest, conversationRoutes);
app.use('/api/training', auditAccess, authenticateRequest, trainingRoutes);
app.use('/api/users', auditAccess, authenticateRequest, userRoutes);
app.use('/v1/live', auditAccess, authenticateRequest);
app.use('/v1/catalog/reindex', auditAccess, authenticateRequest);


const PORT = process.env.PORT || 3008;

const main = async () => {
  const adapterDB = new Database();
  const adapterFlow = flow;
  const adapterProvider = createProvider(Provider, {
    jwtToken: process.env.jwtToken,
    numberId: process.env.numberId,
    verifyToken: process.env.verifyToken,
    version: 'v22.0',
  });

  const sendText = async (phone: string, text: string) => {
    await adapterProvider.sendText(phone, text);
  };

  const conversationHandler = createConversationHandler({ sendText });

  adapterProvider.on('message', async (message) => {
    try {
      await conversationHandler(message as unknown as MetaMessageCtx);
    } catch (error) {
      console.error('Error procesando mensaje entrante:', error);
    }
  });

  const botInstance = await createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB,
  });

  setCatalogoBot(botInstance);

  const { httpServer } = botInstance;

  app.post('/panel/send', auditAccess, authenticateRequest, async (req, res) => {
    const { phone, text } = req.body ?? {};

    if (!phone || !text) {
      res.status(400).json({ ok: false, error: 'phone y text son obligatorios.' });
      return;
    }

    try {
      const chatStateSnap = await db.collection('liveChatStates').doc(phone).get();
      if (chatStateSnap.exists && chatStateSnap.data()?.modoHumano === true) {
        res.status(423).json({ ok: false, error: 'modo_humano_activo' });
        return;
      }

      await sendText(phone, text);
      await db.collection('liveChat').add({
        user: phone,
        text,
        fileUrl: null,
        fileType: 'text',
        timestamp: FieldValue.serverTimestamp(),
        origen: 'operador',
      });

      res.json({ ok: true });
    } catch (error) {
      console.error('Error enviando mensaje desde panel:', error);
      await db
        .collection('logs')
        .doc('sendFailures')
        .collection('entries')
        .add({
          phone,
          text,
          at: FieldValue.serverTimestamp(),
          error: error instanceof Error ? error.message : String(error),
        });
      res.status(500).json({ ok: false, error: 'Error interno al enviar mensaje' });
    }
  });

  const appHandler = app as unknown as (req: any, res: any, next: any) => void;
  adapterProvider.server.use((req, res, next) => {
    const url = req.url ?? '';
    if (url.startsWith('/webhook')) {
      return next();
    }
    const prefixes = ['/api', '/panel', '/v1/live', '/v1/catalog', '/v1/messages'];
    if (prefixes.some((prefix) => url.startsWith(prefix))) {
      return appHandler(req, res, next);
    }
    return next();
  });

  httpServer(+PORT);
};

main();
