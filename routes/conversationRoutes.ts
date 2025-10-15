import express from "express";
import { z } from "zod";
import { db } from "../src/firebaseConfig.js";

const saveConversationSchema = z.object({
    userMessage: z.string().min(1, "El mensaje del usuario es obligatorio"),
    botResponse: z.string().min(1, "La respuesta del bot es obligatoria"),
});

const formatZodErrors = (error: z.ZodError) =>
    error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
    }));

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
        const validation = saveConversationSchema.safeParse(req.body);

        if (!validation.success) {
            res.status(400).json({
                error: "Cuerpo de la petición inválido",
                details: formatZodErrors(validation.error),
            });
            return;
        }

        const { userMessage, botResponse } = validation.data;

        await db.collection("conversations").add({
            userMessage,
            botResponse,
            timestamp: new Date()
        });

        res.status(201).json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: "Error al guardar la conversación", details: error?.message || error });
    }
});

export default router;

