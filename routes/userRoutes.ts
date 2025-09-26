import { Router } from "express";
import { db } from "../src/firebaseConfig.js";

const router = Router();

// DELETE /api/users/:userId/memories
router.delete("/:userId/memories", async (req, res): Promise<void> => {
  const { userId } = req.params;
  if (!userId) {
    res.status(400).json({ error: "userId requerido" });
    return;
  }

  try {
    const userDoc = db.collection("users").doc(userId);
    const userSnap = await userDoc.get();
    if (userSnap.exists) {
      await userDoc.delete();
    }

    const memSnap = await db
      .collection("user_memories")
      .where("userId", "==", userId)
      .get();

    const batch = db.batch();
    memSnap.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    res.json({ ok: true, deleted: memSnap.size });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo eliminar la memoria del usuario" });
  }
});

export default router;
