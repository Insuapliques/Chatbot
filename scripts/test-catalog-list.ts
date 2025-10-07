/**
 * Test Script: Catalog List Feature
 *
 * This script demonstrates the new catalog listing functionality.
 * It simulates different user messages and shows what the system would respond.
 */

import { db } from '../src/firebaseConfig.js';
import { findProductoByMessage, isGenericCatalogRequest, buildCatalogListMessage } from '../src/services/productos.service.js';

interface TestCase {
  message: string;
  description: string;
}

const testCases: TestCase[] = [
  { message: 'enviame el catalogo', description: 'Generic request - should show list' },
  { message: 'quiero ver el catálogo', description: 'Generic request with accents - should show list' },
  { message: 'catalogo de chompas', description: 'Specific keyword - should match exact product' },
  { message: 'dame la lista de precios', description: 'Price list request - should show list' },
  { message: 'enviame diseños', description: 'Design request - should show list' },
  { message: 'que modelos tienes', description: 'Models request - should show list' },
  { message: 'hola', description: 'Greeting - should NOT trigger catalog' },
  { message: 'quiero comprar', description: 'Purchase intent - should NOT trigger catalog' },
];

async function runTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 CATALOG LIST FEATURE - TEST SCRIPT');
  console.log('═══════════════════════════════════════════════════════\n');

  // First, check what's in the database
  console.log('📊 CURRENT CATALOG PRODUCTS IN FIRESTORE:\n');
  const snapshot = await db.collection('productos_chatbot').get();

  if (snapshot.empty) {
    console.log('❌ No products found in productos_chatbot collection!\n');
    console.log('Please add some products first using the web panel.\n');
    return;
  }

  snapshot.forEach((doc, index) => {
    const data = doc.data();
    console.log(`${index + 1}. ${doc.id}`);
    console.log(`   Keyword: ${data.keyword}`);
    console.log(`   Type: ${data.tipo}`);
    console.log(`   URL: ${data.url ? 'Yes' : 'No'}`);
    console.log('');
  });

  console.log('═══════════════════════════════════════════════════════\n');
  console.log('🔍 TESTING USER MESSAGES:\n');

  for (const testCase of testCases) {
    console.log(`📝 Message: "${testCase.message}"`);
    console.log(`   (${testCase.description})\n`);

    // Check if it's a generic catalog request
    const isGeneric = isGenericCatalogRequest(testCase.message);
    console.log(`   Is Generic Request: ${isGeneric ? '✅ YES' : '❌ NO'}`);

    // Try to find exact product match
    const producto = await findProductoByMessage(testCase.message);

    if (producto) {
      console.log(`   Exact Match Found: ✅ YES`);
      console.log(`   Product ID: ${producto.id}`);
      console.log(`   Keyword: ${producto.keyword}`);
      console.log(`   Type: ${producto.tipo}`);
      console.log(`   Action: 📤 SEND CATALOG FILE`);
    } else {
      console.log(`   Exact Match Found: ❌ NO`);

      if (isGeneric) {
        console.log(`   Action: 📋 SHOW CATALOG LIST`);
        const catalogList = await buildCatalogListMessage();
        if (catalogList) {
          console.log('\n   Bot Response:');
          console.log('   ┌─────────────────────────────────────────');
          catalogList.split('\n').forEach(line => {
            console.log(`   │ ${line}`);
          });
          console.log('   └─────────────────────────────────────────');
        }
      } else {
        console.log(`   Action: 🤖 PASS TO AI`);
      }
    }

    console.log('\n---\n');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('✅ TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════');
}

// Run tests
runTests()
  .then(() => {
    console.log('\nExiting...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error running tests:', error);
    process.exit(1);
  });
