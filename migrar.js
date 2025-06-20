import admin from 'firebase-admin';

// Inicializar origen
const origenApp = admin.initializeApp({
  credential: admin.credential.cert('./origen.json')
}, 'origen');

const destinoApp = admin.initializeApp({
  credential: admin.credential.cert('./destino.json')
}, 'destino');

const dbOrigen = origenApp.firestore();
const dbDestino = destinoApp.firestore();

const colecciones = [
  'clientes',
  'conversations',
  'liveChat',
  'productos_chatbot',
  'settings',
  'training'
];

const migrarColeccion = async (coleccion) => {
  console.log(`📥 Migrando colección: ${coleccion}`);
  const snapshot = await dbOrigen.collection(coleccion).get();
  const batch = dbDestino.batch();

  snapshot.forEach(doc => {
    const ref = dbDestino.collection(coleccion).doc(doc.id);
    batch.set(ref, doc.data());
  });

  await batch.commit();
  console.log(`✅ Colección migrada: ${coleccion}`);
};

const main = async () => {
  for (const col of colecciones) {
    await migrarColeccion(col);
  }
};

main();
