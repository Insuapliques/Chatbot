import express, { Request, Response } from 'express';
import multer from 'multer';
import { getStorage } from 'firebase-admin/storage';
import { db } from '../src/firebaseConfig';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

router.post('/', upload.single('archivo'), async (req: MulterRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No se recibió ningún archivo' });
      return;
    }

    const bucket = getStorage().bucket();
    const destino = `entrenamiento/${Date.now()}-${req.file.originalname}`;
    const archivoFirebase = bucket.file(destino);

    await archivoFirebase.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype },
    });

    const [url] = await archivoFirebase.getSignedUrl({
      action: 'read',
      expires: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 días
    });

    await db.collection('settings').doc('archivo_entrenamiento').set({
      url,
      path: destino,
      nombre: req.file.originalname,
      contentType: req.file.mimetype,
      updatedAt: new Date(),
    });

    res.status(200).json({ message: 'Archivo subido correctamente', url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al subir el archivo' });
  }
});

export default router;

