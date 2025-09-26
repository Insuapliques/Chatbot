import { db } from '../firebaseConfig.js';
import { includesAll, normalize } from '../utils/text.js';

export type ProductoTipo = 'pdf' | 'image' | 'video' | 'url' | 'texto';

export interface ProductoCatalogo {
  id: string;
  keyword: string;
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
      return {
        id: doc.id,
        keyword: data.keyword ?? '',
        respuesta: data.respuesta ?? null,
        tipo,
        url: data.url ?? null,
      } satisfies ProductoCatalogo;
    })
    .filter((producto) => Boolean(producto.keyword));
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

  for (const producto of productos) {
    if (includesAll(normalizedMessage, producto.keyword)) {
      return producto;
    }
  }

  if (FALLBACK_REGEX.test(normalizedMessage)) {
    return productos[0] ?? null;
  }

  return null;
}

export function clearProductosCache(): void {
  cache = null;
  cacheTimestamp = 0;
}
