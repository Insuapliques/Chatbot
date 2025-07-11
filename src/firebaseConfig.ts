import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

if (
  !process.env.FIREBASE_PROJECT_ID ||
  !process.env.FIREBASE_CLIENT_EMAIL ||
  !process.env.FIREBASE_PRIVATE_KEY ||
  !process.env.FIREBASE_STORAGE_BUCKET
) {
  console.error("Error: Faltan variables de entorno para Firebase.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // ✅ Bucket aquí
});

const db = admin.firestore();
const bucket = admin.storage().bucket(); // ✅ Exporta el bucket

export { db, bucket };
