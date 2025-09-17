import { Router } from 'express';
import { reindexAll } from '../src/services/catalogIndexer';

const router = Router();

router.post('/reindex', async (_req, res) => {
  try {
    const result = await reindexAll();
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error al reindexar el catálogo:', error);
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

export default router;
