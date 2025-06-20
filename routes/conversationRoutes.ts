import express from "express";
import { db } from "../src/firebaseConfig";

const router = express.Router();

// Obtener todas las conversaciones ordenadas por fecha
router.get("/", async (req, res) => {
    try {
        const snapshot = await db.collection("conversations").orderBy("timestamp", "desc").get();
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: "Error al obtener conversaciones", details: error?.message || error });
    }
});

// Guardar conversación en Firestore
router.post("/", async (req, res) => {
    try {
        const { userMessage, botResponse } = req.body;

        if (!userMessage || !botResponse) {
            res.status(400).json({ error: "Se requieren 'userMessage' y 'botResponse'" });
            return;
        }

        await db.collection("conversations").add({
            userMessage,
            botResponse,
            timestamp: new Date()
        });

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: "Error al guardar la conversación", details: error?.message || error });
    }
});

export default router;
