import 'dotenv/config';
import { applicationDefault, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

type ServiceAccountEnv = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  storageBucket?: string;
};

function parseServiceAccount(): ServiceAccountEnv | undefined {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT ?? process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as ServiceAccountEnv;
  } catch (error) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT debe contener un JSON válido.');
  }
}

function normalizePrivateKey(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.replace(/\\n/g, '\n');
}

const serviceAccount = parseServiceAccount();

function resolveCredential() {
  const projectId = serviceAccount?.project_id ?? process.env.FIREBASE_PROJECT_ID;
  const clientEmail = serviceAccount?.client_email ?? process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(serviceAccount?.private_key ?? process.env.FIREBASE_PRIVATE_KEY);

  if (projectId && clientEmail && privateKey) {
    return cert({ projectId, clientEmail, privateKey });
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return applicationDefault();
  }

  throw new Error(
    'Credenciales de Firebase ausentes. Configura GOOGLE_SERVICE_ACCOUNT (JSON) o variables FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY.',
  );
}

function resolveStorageBucket(): string {
  const bucket =
    process.env.FIREBASE_STORAGE_BUCKET ??
    process.env.GOOGLE_CLOUD_STORAGE_BUCKET ??
    serviceAccount?.storageBucket;

  if (!bucket) {
    throw new Error('FIREBASE_STORAGE_BUCKET o GOOGLE_CLOUD_STORAGE_BUCKET deben estar definidos.');
  }

  return bucket;
}

const firebaseApp = getApps().length > 0
  ? getApp()
  : initializeApp({
      credential: resolveCredential(),
      storageBucket: resolveStorageBucket(),
    });

const db = getFirestore(firebaseApp);
const bucket = getStorage(firebaseApp).bucket();

export { firebaseApp, db, bucket };
