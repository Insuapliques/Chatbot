import express from "express";
import { db } from "../src/firebaseConfig";

const router = express.Router();
const collectionName = "training";

interface TrainingEntry {
    question: string;
    answer: string;
}

// Obtener todas las respuestas del entrenamiento
router.get("/", async (_req, res) => {
    try {
        const snapshot = await db.collection(collectionName).get();
        const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...(doc.data() as TrainingEntry)
        }));
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: "Error al obtener el entrenamiento", details: error?.message || error });
    }
});

// Agregar una nueva pregunta-respuesta al entrenamiento
router.post("/", async (req, res) => {
    try {
        const { question, answer } = req.body as TrainingEntry;
        if (typeof question !== "string" || typeof answer !== "string" || !question.trim() || !answer.trim()) {
            res.status(400).json({ error: "Se requieren 'question' y 'answer' válidos" });
            return;
        }

        const newEntry = await db.collection(collectionName).add({ question, answer });
        res.status(201).json({ success: true, id: newEntry.id });
    } catch (error: any) {
        res.status(500).json({ error: "Error al agregar la respuesta", details: error?.message || error });
    }
});

// Editar una respuesta existente
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { question, answer } = req.body as TrainingEntry;

        if (typeof question !== "string" || typeof answer !== "string" || !question.trim() || !answer.trim()) {
            res.status(400).json({ error: "Se requieren 'question' y 'answer' válidos" });
            return;
        }

        const docRef = db.collection(collectionName).doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            res.status(404).json({ error: "Respuesta no encontrada" });
            return;
        }

        await docRef.update({ question, answer });
        res.json({ success: true, message: "Respuesta actualizada" });
    } catch (error: any) {
        res.status(500).json({ error: "Error al actualizar la respuesta", details: error?.message || error });
    }
});

// Eliminar una respuesta
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const docRef = db.collection(collectionName).doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            res.status(404).json({ error: "Respuesta no encontrada" });
            return;
        }

        await docRef.delete();
        res.json({ success: true, message: "Respuesta eliminada" });
    } catch (error: any) {
        res.status(500).json({ error: "Error al eliminar la respuesta", details: error?.message || error });
    }
});

export default router;