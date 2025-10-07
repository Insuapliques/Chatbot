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

// Regex for detecting generic catalog requests
const CATALOG_REQUEST_REGEX = /(catalog|catalogo|cata|lista|menu|precio|disen|modelo?s?)/i;

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

export async function findProductoByMessage(message: string): Promise<ProductoCatalogo | null> {
  const productos = await getProductos();
  if (productos.length === 0) {
    console.warn('[productos] No products found in productos_chatbot collection');
    return null;
  }

  const normalizedMessage = normalize(message);

  // Check all keywords for exact match
  for (const producto of productos) {
    for (const keyword of producto.keywords) {
      if (includesAll(normalizedMessage, keyword)) {
        console.log('[productos] ✅ Exact keyword match found:', keyword);
        return producto;
      }
    }
  }

  console.log('[productos] No exact match found for:', normalizedMessage);
  return null;
}

/**
 * Detects if the message is a generic catalog request (without specific product keyword)
 * Returns true if user is asking for catalogs in general
 */
export function isGenericCatalogRequest(message: string): boolean {
  const normalized = normalize(message);
  return CATALOG_REQUEST_REGEX.test(normalized);
}

/**
 * Build a formatted list of available catalogs for the user to choose from
 * Returns a text message listing all catalog keywords
 */
export async function buildCatalogListMessage(): Promise<string | null> {
  const productos = await getProductos();
  if (productos.length === 0) {
    return null;
  }

  const lines: string[] = [
    'Tenemos los siguientes catálogos disponibles:',
    '',
  ];

  productos.forEach((producto, index) => {
    // Use first keyword as the display name
    const displayName = producto.keyword || 'Catálogo sin nombre';
    lines.push(`${index + 1}. ${displayName}`);
  });

  lines.push('');
  lines.push('¿Cuál te gustaría revisar? Escríbelo tal como aparece arriba.');

  return lines.join('\n');
}

export function clearProductosCache(): void {
  cache = null;
  cacheTimestamp = 0;
}
