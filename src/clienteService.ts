// clienteService.ts
import { db } from './firebaseConfig';

export const obtenerCliente = async (numero: string): Promise<string | null> => {
    const ref = db.collection("clientes").doc(numero);
    const doc = await ref.get();
    if (!doc.exists) return null;//Si no existe el doc crearlo como nuevo
    return doc.data()?.nombre || null;
};

export const guardarCliente = async (numero: string, nombre: string): Promise<void> => {
    await db.collection("clientes").doc(numero).set({ nombre });
};
