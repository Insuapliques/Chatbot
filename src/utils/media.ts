import fetch from 'node-fetch';
import { getStorage } from 'firebase-admin/storage';
import { v4 as uuidv4 } from 'uuid';

interface UploadOptions {
  mimeType?: string;
  fileName?: string;
  fallbackExt?: string;
  fallbackContentType?: string;
}

function inferExtension({ mimeType, fileName, fallbackExt = 'bin' }: UploadOptions): string {
  if (fileName && fileName.includes('.')) {
    return fileName.split('.').pop() ?? fallbackExt;
  }
  if (!mimeType) {
    return fallbackExt;
  }
  const [type, subtype] = mimeType.split('/');
  if (!subtype) {
    return fallbackExt;
  }
  if (subtype.includes('+')) {
    return subtype.split('+').pop() ?? fallbackExt;
  }
  if (type === 'audio' && subtype === 'ogg') {
    return 'ogg';
  }
  if (subtype === 'mpeg') {
    return 'mp3';
  }
  if (subtype === 'png') {
    return 'png';
  }
  if (subtype === 'jpeg' || subtype === 'jpg') {
    return 'jpg';
  }
  if (subtype === 'pdf') {
    return 'pdf';
  }
  if (subtype === 'mp4') {
    return 'mp4';
  }
  return subtype;
}

export async function getWhatsAppMediaUrl(mediaId: string): Promise<string> {
  const token = process.env.jwtToken;
  if (!token) {
    throw new Error('jwtToken no está definido en el entorno.');
  }
  const response = await fetch(`https://graph.facebook.com/v17.0/${mediaId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Error obteniendo media URL de WhatsApp (${response.status}).`);
  }
  const data = (await response.json()) as { url: string };
  if (!data.url) {
    throw new Error('Respuesta inesperada de WhatsApp Media API (sin url).');
  }
  return data.url;
}

export async function fetchMediaBuffer(mediaUrl: string): Promise<Buffer> {
  const token = process.env.jwtToken;
  if (!token) {
    throw new Error('jwtToken no está definido en el entorno.');
  }
  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Error descargando media desde WhatsApp (${response.status}).`);
  }
  return await response.buffer();
}

export async function downloadAndUploadToFirebase(mediaId: string, options: UploadOptions = {}): Promise<string> {
  const { mimeType, fileName, fallbackExt, fallbackContentType = 'application/octet-stream' } = options;
  const resolvedMimeType = mimeType ?? fallbackContentType;
  const ext = inferExtension({ mimeType: resolvedMimeType, fileName, fallbackExt });
  const mediaUrl = await getWhatsAppMediaUrl(mediaId);
  const buffer = await fetchMediaBuffer(mediaUrl);
  const fileNamePath = `liveChat/${Date.now()}_${uuidv4()}.${ext}`;

  const bucket = getStorage().bucket();
  const file = bucket.file(fileNamePath);
  await file.save(buffer, { contentType: resolvedMimeType });

  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: '2030-03-01',
  });

  return signedUrl;
}
