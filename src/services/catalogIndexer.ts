import path from 'node:path';
import { FieldValue } from 'firebase-admin/firestore';
import pdfParse from 'pdf-parse';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { bucket, db } from '../firebaseConfig';

const STORAGE_PREFIX = (process.env.STORAGE_CATALOGOS_PATH ?? '').replace(/^\/+|\/+$/g, '');

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? '';
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL ?? '';
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') ?? '';

let visionClient: ImageAnnotatorClient | null = null;

const getVisionClient = (): ImageAnnotatorClient => {
  if (!visionClient) {
    if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
      throw new Error('Faltan credenciales para inicializar el cliente de Google Vision.');
    }

    visionClient = new ImageAnnotatorClient({
      projectId: FIREBASE_PROJECT_ID,
      credentials: {
        client_email: FIREBASE_CLIENT_EMAIL,
        private_key: FIREBASE_PRIVATE_KEY,
      },
    });
  }

  return visionClient;
};

const buildCatalogDocId = (fileRef: string): string =>
  Buffer.from(fileRef).toString('base64url');

const normalisePrefix = (prefix: string): string => {
  if (!prefix) {
    return '';
  }

  const trimmed = prefix.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed.length > 0 ? `${trimmed}/` : '';
};

const looksLikePdf = (fileName: string, contentType?: string): boolean => {
  if (contentType?.toLowerCase().includes('pdf')) {
    return true;
  }

  const extension = path.extname(fileName).toLowerCase();
  return extension === '.pdf';
};

const looksLikeImage = (fileName: string, contentType?: string): boolean => {
  if (contentType?.toLowerCase().startsWith('image/')) {
    return true;
  }

  const extension = path.extname(fileName).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp', '.heic'].includes(extension);
};

const extractTextFromPdf = async (buffer: Buffer): Promise<string> => {
  const result = await pdfParse(buffer);
  return result.text ?? '';
};

const extractTextWithOCR = async (buffer: Buffer): Promise<string> => {
  const client = getVisionClient();
  const [response] = await client.documentTextDetection({
    image: { content: buffer },
  });

  return response.fullTextAnnotation?.text ?? '';
};

const extractPlainText = (buffer: Buffer): string => buffer.toString('utf8');

interface IndexResult {
  fileRef: string;
  contentLength: number;
  status: 'indexed' | 'empty';
}

interface FailedIndexResult {
  fileRef: string;
  status: 'error';
  error: string;
}

export const indexCatalogObject = async (fileRef: string): Promise<IndexResult> => {
  if (!fileRef) {
    throw new Error('El parámetro fileRef es obligatorio.');
  }

  const file = bucket.file(fileRef);
  const [exists] = await file.exists();

  if (!exists) {
    throw new Error(`El archivo ${fileRef} no existe en el bucket ${bucket.name}.`);
  }

  const [metadata] = await file.getMetadata();
  const [buffer] = await file.download();

  let content = '';

  try {
    if (looksLikePdf(fileRef, metadata.contentType)) {
      content = await extractTextFromPdf(buffer);
    } else if (looksLikeImage(fileRef, metadata.contentType)) {
      content = await extractTextWithOCR(buffer);
    } else {
      content = extractPlainText(buffer);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.collection('catalog_index').doc(buildCatalogDocId(fileRef)).set(
      {
        fileRef,
        bucket: bucket.name,
        status: 'error',
        errorMessage: message,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    throw new Error(`No fue posible extraer texto del archivo ${fileRef}: ${message}`);
  }

  const trimmedContent = content.trim();

  await db.collection('catalog_index').doc(buildCatalogDocId(fileRef)).set(
    {
      fileRef,
      bucket: bucket.name,
      status: trimmedContent.length > 0 ? 'indexed' : 'empty',
      content: trimmedContent,
      metadata: {
        contentType: metadata.contentType ?? null,
        size: metadata.size ? Number(metadata.size) : null,
        updated: metadata.updated ?? metadata.timeCreated ?? null,
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    fileRef,
    contentLength: trimmedContent.length,
    status: trimmedContent.length > 0 ? 'indexed' : 'empty',
  };
};

export const reindexAll = async (): Promise<{
  total: number;
  indexed: number;
  empty: number;
  failed: FailedIndexResult[];
}> => {
  if (!STORAGE_PREFIX) {
    throw new Error('La variable de entorno STORAGE_CATALOGOS_PATH es obligatoria para el reindexado.');
  }

  const prefix = normalisePrefix(STORAGE_PREFIX);
  const [files] = await bucket.getFiles({ prefix });

  const failed: FailedIndexResult[] = [];
  let indexed = 0;
  let empty = 0;

  for (const file of files) {
    // Ignorar directorios o archivos temporales
    if (!file.name || file.name.endsWith('/')) {
      continue;
    }

    try {
      const result = await indexCatalogObject(file.name);
      if (result.status === 'indexed') {
        indexed += 1;
      } else {
        empty += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({
        fileRef: file.name,
        status: 'error',
        error: message,
      });
    }
  }

  return {
    total: indexed + empty + failed.length,
    indexed,
    empty,
    failed,
  };
};

export const listCatalogFiles = async (): Promise<string[]> => {
  if (!STORAGE_PREFIX) {
    throw new Error('La variable de entorno STORAGE_CATALOGOS_PATH es obligatoria para listar archivos.');
  }

  const prefix = normalisePrefix(STORAGE_PREFIX);
  const [files] = await bucket.getFiles({ prefix });
  return files
    .map((file) => file.name)
    .filter((name): name is string => typeof name === 'string' && !name.endsWith('/'));
};

export const handleCatalogObjectFinalize = async (fileRef?: string): Promise<IndexResult> => {
  if (!fileRef) {
    throw new Error('El evento de almacenamiento no contiene el nombre del archivo.');
  }

  const prefix = normalisePrefix(STORAGE_PREFIX);

  if (prefix && !fileRef.startsWith(prefix)) {
    throw new Error(`El archivo ${fileRef} no pertenece al prefijo configurado (${prefix}).`);
  }

  return indexCatalogObject(fileRef);
};
