import { db } from '../firebaseConfig';

interface CatalogDocument {
  keyword?: string | string[];
  keywords?: string | string[];
  respuesta?: string;
  tipo?: string;
  url?: string;
  urlFirmado?: string;
  signedUrl?: string;
  mediaId?: string;
  [key: string]: unknown;
}

export interface CatalogMatch {
  id: string;
  keywords: string[];
  respuesta?: string;
  tipo: string;
  url?: string;
  signedUrl?: string;
  mediaId?: string;
  raw: CatalogDocument;
}

export interface SendCatalogPayload {
  body: string;
  mediaUrl?: string;
  match: CatalogMatch;
}

interface SendCatalogParams {
  ctx: any;
  flowDynamic: (message: unknown) => Promise<void>;
  match: CatalogMatch;
  fallbackProvider?: () => Promise<string | undefined> | string | undefined;
  onDelivered?: (payload: SendCatalogPayload) => Promise<void> | void;
}

const CATALOG_COLLECTION = 'productos_chatbot';
const CACHE_TTL_MS = Number(process.env.CATALOG_CACHE_TTL_MS ?? 60_000);

type CatalogCache = {
  items: CatalogMatch[];
  expiresAt: number;
};

let cache: CatalogCache = {
  items: [],
  expiresAt: 0,
};

function normaliseKeywords(doc: CatalogDocument): string[] {
  const rawKeywords = doc.keywords ?? doc.keyword;
  const list = Array.isArray(rawKeywords) ? rawKeywords : rawKeywords ? [rawKeywords] : [];
  return list
    .map((keyword) => (typeof keyword === 'string' ? keyword.trim().toLowerCase() : ''))
    .filter(Boolean);
}

async function loadCatalog(): Promise<CatalogMatch[]> {
  const now = Date.now();
  if (cache.items.length > 0 && cache.expiresAt > now) {
    return cache.items;
  }

  const snapshot = await db.collection(CATALOG_COLLECTION).get();
  const items: CatalogMatch[] = snapshot.docs.map((doc) => {
    const data = doc.data() as CatalogDocument;
    return {
      id: doc.id,
      keywords: normaliseKeywords(data),
      respuesta: typeof data.respuesta === 'string' ? data.respuesta : undefined,
      tipo: typeof data.tipo === 'string' ? data.tipo : 'texto',
      url: typeof data.url === 'string' ? data.url : undefined,
      signedUrl: typeof data.urlFirmado === 'string' ? data.urlFirmado :
        typeof data.signedUrl === 'string' ? data.signedUrl : undefined,
      mediaId: typeof data.mediaId === 'string' ? data.mediaId : undefined,
      raw: data,
    };
  });

  cache = {
    items,
    expiresAt: now + CACHE_TTL_MS,
  };

  return items;
}

export async function findByKeywords(message: string): Promise<CatalogMatch | null> {
  if (!message) {
    return null;
  }

  const normalizedMessage = message.toLowerCase();
  const catalog = await loadCatalog();

  for (const item of catalog) {
    const match = item.keywords.some((keyword) => normalizedMessage.includes(keyword));
    if (match) {
      console.info('[catalogService] Coincidencia encontrada', {
        id: item.id,
        tipo: item.tipo,
      });
      return item;
    }
  }

  return null;
}

export async function resolveMediaUrl(match: CatalogMatch): Promise<string | undefined> {
  if (match.url) {
    return match.url;
  }
  if (match.signedUrl) {
    return match.signedUrl;
  }
  if (match.mediaId) {
    const token = process.env.jwtToken;
    if (!token) {
      console.warn('[catalogService] No se pudo resolver mediaId: jwtToken no configurado');
      return undefined;
    }

    const response = await fetch(`https://graph.facebook.com/v17.0/${match.mediaId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.error('[catalogService] Error obteniendo media desde Graph API', {
        mediaId: match.mediaId,
        status: response.status,
      });
      return undefined;
    }

    const data = (await response.json()) as { url?: string };
    if (!data.url) {
      console.warn('[catalogService] Graph API no devolvió URL para mediaId', {
        mediaId: match.mediaId,
      });
      return undefined;
    }

    return data.url;
  }

  return undefined;
}

export async function sendCatalog({
  ctx,
  flowDynamic,
  match,
  fallbackProvider,
  onDelivered,
}: SendCatalogParams): Promise<void> {
  const start = Date.now();
  try {
    let body = (match.respuesta ?? '').trim();
    if (!body && fallbackProvider) {
      try {
        const fallbackValue =
          typeof fallbackProvider === 'function'
            ? await fallbackProvider()
            : fallbackProvider;
        body = (fallbackValue ?? '').trim();
      } catch (fallbackError) {
        console.error('[catalogService] Error obteniendo mensaje de respaldo', fallbackError);
      }
    }

    if (!body) {
      console.warn('[catalogService] No se envió catálogo: mensaje vacío', {
        id: match.id,
      });
      return;
    }

    const tipo = (match.tipo ?? 'texto').toLowerCase();
    const needsMedia = ['imagen', 'image', 'video', 'pdf', 'documento', 'media'].includes(tipo);
    let mediaUrl: string | undefined;

    if (needsMedia) {
      mediaUrl = await resolveMediaUrl(match);
      if (!mediaUrl) {
        console.warn('[catalogService] No se encontró URL para el recurso multimedia', {
          id: match.id,
          tipo,
        });
      }
    }

    if (mediaUrl) {
      await flowDynamic([{ body, media: mediaUrl }]);
    } else {
      await flowDynamic(body);
    }

    if (onDelivered) {
      await onDelivered({ body, mediaUrl, match });
    }

    const latencyMs = Date.now() - start;
    console.info('[catalogService] Catálogo enviado', {
      id: match.id,
      tipo,
      hasMedia: Boolean(mediaUrl),
      latencyMs,
      to: ctx?.from,
    });
  } catch (error) {
    console.error('[catalogService] Error enviando catálogo', {
      id: match.id,
      to: ctx?.from,
      error,
    });
    throw error;
  }
}
