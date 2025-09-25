import { Router } from "express";
import { db } from "../src/firebaseConfig";

const router = Router();

router.delete("/:userId/memories", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: "userId requerido" });
  try {
    const userDoc = db.collection("users").doc(userId);
    const userSnap = await userDoc.get();
    if (userSnap.exists) await userDoc.delete();

    const memSnap = await db.collection("user_memories").where("userId", "==", userId).get();
    const batch = db.batch();
    memSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    return res.json({ ok: true, deletedMemories: memSnap.size });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Error borrando memorias" });
  }
});

export default router;
