/**
 * Price List Loader for AI Context
 * Loads XLSX price list from Firebase Storage and formats it for AI
 */

import { getStorage } from 'firebase-admin/storage';
import * as xlsx from 'xlsx';
import { db } from '../firebaseConfig.js';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let priceListCache: string | null = null;
let lastFetched: number | null = null;

interface PriceListItem {
  producto?: string;
  precio?: string | number;
  descripcion?: string;
  [key: string]: any;
}

/**
 * Load price list from Firebase and format for AI context
 * Returns formatted string suitable for injection into AI prompt
 */
export async function loadPriceListForAI(): Promise<string | null> {
  const now = Date.now();

  // Return cached version if still valid
  if (priceListCache && lastFetched && now - lastFetched < CACHE_TTL_MS) {
    return priceListCache;
  }

  try {
    // Load archivo_entrenamiento document from settings collection
    const settingsDoc = await db.collection('settings').doc('archivo_entrenamiento').get();
    const data = settingsDoc.data();

    if (!data) {
      console.warn('[priceListLoader] Document settings/archivo_entrenamiento not found');
      return null;
    }

    console.log('[priceListLoader] 📄 Document data:', {
      Name: data.Name,
      Path: data.Path,
      ContentType: data.ContentType,
      UpdatedAt: data.UpdatedAt,
      hasUrl: !!data.url,
    });

    // Try to use URL if available, otherwise fall back to Path (capitalized field names)
    let buffer: Buffer;
    const url = data.url;
    const path = data.Path || data.path;

    if (url) {
      console.log('[priceListLoader] 📥 Downloading from URL:', url);
      const response = await fetch(url);
      if (!response.ok) {
        console.error('[priceListLoader] ❌ Failed to download from URL:', response.status, response.statusText);
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else if (path) {
      console.log('[priceListLoader] 📊 Loading from Storage path:', path);
      const bucket = getStorage().bucket();
      const file = bucket.file(path);

      const [exists] = await file.exists();
      if (!exists) {
        console.error('[priceListLoader] ❌ File does not exist at path:', path);
        return null;
      }

      [buffer] = await file.download();
    } else {
      console.warn('[priceListLoader] No Path or url found in settings/archivo_entrenamiento');
      return null;
    }

    // Parse XLSX
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const items = xlsx.utils.sheet_to_json<PriceListItem>(sheet, { defval: '' });

    console.log(`[priceListLoader] ✅ Loaded ${items.length} products from price list`);

    // Format for AI context
    const formatted = formatPriceListForAI(items);

    // Cache the result
    priceListCache = formatted;
    lastFetched = now;

    return formatted;
  } catch (error) {
    console.error('[priceListLoader] Error loading price list:', error);
    return null;
  }
}

/**
 * Format price list items into a compact, AI-friendly string
 */
function formatPriceListForAI(items: PriceListItem[]): string {
  if (items.length === 0) {
    return '';
  }

  const lines: string[] = [
    '📋 LISTA DE PRECIOS ACTUALIZADA:',
    '',
  ];

  items.forEach((item, index) => {
    const producto = item.producto || item.Producto || item.PRODUCTO || 'Producto sin nombre';
    const precio = item.precio || item.Precio || item.PRECIO || 'No disponible';
    const descripcion = item.descripcion || item.Descripcion || item.DESCRIPCION || '';

    // Compact format: Product | Price | Description
    const line = `${index + 1}. ${producto} - $${precio}${descripcion ? ` (${descripcion})` : ''}`;
    lines.push(line);
  });

  lines.push('');
  lines.push('IMPORTANTE: Usa estos precios exactos cuando el usuario pregunte por costos o cotizaciones.');

  return lines.join('\n');
}

/**
 * Clear the price list cache (useful for testing or manual refresh)
 */
export function clearPriceListCache(): void {
  priceListCache = null;
  lastFetched = null;
  console.log('[priceListLoader] Cache cleared');
}
