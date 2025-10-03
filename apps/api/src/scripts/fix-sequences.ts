import { getDb } from "../db/client";

async function fixSequences() {
  const db = await getDb();
  
  try {
    console.log("Checking and fixing sequences...");
    
    // Fix merchants sequence
    const merchantsResult = await db.execute(`
      SELECT setval('merchants_id_seq', COALESCE((SELECT MAX(id) FROM merchants), 0) + 1, false);
    `);
    console.log("Fixed merchants sequence:", merchantsResult);
    
    // Fix merchant_users sequence
    const usersResult = await db.execute(`
      SELECT setval('merchant_users_id_seq', COALESCE((SELECT MAX(id) FROM merchant_users), 0) + 1, false);
    `);
    console.log("Fixed merchant_users sequence:", usersResult);
    
    // Fix other sequences as needed
    const ordersResult = await db.execute(`
      SELECT setval('orders_id_seq', COALESCE((SELECT MAX(id) FROM orders), 0) + 1, false);
    `);
    console.log("Fixed orders sequence:", ordersResult);
    
    const passesResult = await db.execute(`
      SELECT setval('passes_id_seq', COALESCE((SELECT MAX(id) FROM passes), 0) + 1, false);
    `);
    console.log("Fixed passes sequence:", passesResult);
    
    console.log("All sequences fixed successfully!");
    
  } catch (error) {
    console.error("Error fixing sequences:", error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  fixSequences()
    .then(() => {
      console.log("Script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Script failed:", error);
      process.exit(1);
    });
}

export { fixSequences };