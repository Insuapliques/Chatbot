import { db } from '../firebaseConfig.js';
import { includesAll, normalize } from '../utils/text.js';

export type ProductoTipo = 'pdf' | 'image' | 'video' | 'url' | 'texto';

export interface ProductoCatalogo {
  id: string;
  keyword: string; // Normalized to string for matching (may come from array or string)
  keywords: string[]; // All keywords as array
  respuesta?: string | null;
  tipo: ProductoTipo;
  url?: string | null;
}

const CACHE_TTL_MS = 60_000;
let cache: ProductoCatalogo[] | null = null;
let cacheTimestamp = 0;

async function fetchProductos(): Promise<ProductoCatalogo[]> {
  const snapshot = await db.collection('productos_chatbot').get();
  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      const tipo = String(data.tipo ?? 'texto').toLowerCase() as ProductoTipo;

      // Support both keyword formats: string (from frontend) or array (from docs)
      let keywords: string[] = [];
      if (Array.isArray(data.keyword)) {
        keywords = data.keyword.filter((k: any) => typeof k === 'string' && k.trim());
      } else if (typeof data.keyword === 'string' && data.keyword.trim()) {
        keywords = [data.keyword.trim()];
      }

      return {
        id: doc.id,
        keyword: keywords[0] ?? '', // Primary keyword for backward compatibility
        keywords, // All keywords for multi-keyword matching
        respuesta: data.respuesta ?? null,
        tipo,
        url: data.url ?? null,
      } satisfies ProductoCatalogo;
    })
    .filter((producto) => producto.keywords.length > 0);
}

export async function getProductos(): Promise<ProductoCatalogo[]> {
  const now = Date.now();
  if (!cache || now - cacheTimestamp > CACHE_TTL_MS) {
    cache = await fetchProductos();
    cacheTimestamp = now;
  }
  return cache ?? [];
}

const FALLBACK_REGEX = /(catalog|catalogo|cata|disen|modelo?s?)/i;

export async function findProductoByMessage(message: string): Promise<ProductoCatalogo | null> {
  const productos = await getProductos();
  if (productos.length === 0) {
    return null;
  }

  const normalizedMessage = normalize(message);

  // Check all keywords for each product
  for (const producto of productos) {
    for (const keyword of producto.keywords) {
      if (includesAll(normalizedMessage, keyword)) {
        return producto;
      }
    }
  }

  // Fallback to first product if message matches common catalog keywords
  if (FALLBACK_REGEX.test(normalizedMessage)) {
    return productos[0] ?? null;
  }

  return null;
}

export function clearProductosCache(): void {
  cache = null;
  cacheTimestamp = 0;
}
