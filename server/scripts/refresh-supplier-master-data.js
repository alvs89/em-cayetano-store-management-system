require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool } = require('pg');
const {
  OFFICIAL_SUPPLIERS,
  getOfficialSupplierForProduct,
  getOfficialSupplierName,
  normalizeSupplierName
} = require('./supplier-master-list');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined
});

async function refreshSupplierMasterData() {
  const client = await pool.connect();
  const summary = {
    officialSuppliers: OFFICIAL_SUPPLIERS.length,
    productsUpdated: 0,
    archivedInventoryUpdated: 0,
    purchaseTransactionsUpdated: 0,
    remainingLegacyProductSuppliers: [],
    remainingLegacyPurchaseSuppliers: []
  };

  try {
    await client.query('BEGIN');

    const products = await client.query(`
      SELECT product_id, name, category, supplier_name
      FROM products
      ORDER BY product_id
    `);

    for (const [index, product] of products.rows.entries()) {
      const nextSupplier = getOfficialSupplierForProduct(product, index);
      if ((product.supplier_name || null) !== nextSupplier) {
        await client.query(
          `UPDATE products
           SET supplier_name = $1
           WHERE product_id = $2`,
          [nextSupplier, product.product_id]
        );
        summary.productsUpdated += 1;
      }
    }

    const archivedItems = await client.query(`
      SELECT archived_inventory_id, name, category, supplier_name
      FROM archived_inventory
      ORDER BY archived_inventory_id
    `);

    for (const [index, item] of archivedItems.rows.entries()) {
      const nextSupplier = getOfficialSupplierForProduct(item, index);
      if ((item.supplier_name || null) !== nextSupplier) {
        await client.query(
          `UPDATE archived_inventory
           SET supplier_name = $1
           WHERE archived_inventory_id = $2`,
          [nextSupplier, item.archived_inventory_id]
        );
        summary.archivedInventoryUpdated += 1;
      }
    }

    const purchases = await client.query(`
      SELECT purchase_transaction_id, supplier_name
      FROM purchase_transactions
      ORDER BY purchase_transaction_id
    `);

    for (const purchase of purchases.rows) {
      const nextSupplier = getOfficialSupplierName(purchase.supplier_name);
      if (nextSupplier && nextSupplier !== normalizeSupplierName(purchase.supplier_name)) {
        await client.query(
          `UPDATE purchase_transactions
           SET supplier_name = $1
           WHERE purchase_transaction_id = $2`,
          [nextSupplier, purchase.purchase_transaction_id]
        );
        summary.purchaseTransactionsUpdated += 1;
      }
    }

    const officialSupplierValues = OFFICIAL_SUPPLIERS;
    const remainingProducts = await client.query(
      `SELECT DISTINCT supplier_name
       FROM products
       WHERE supplier_name IS NOT NULL
         AND TRIM(supplier_name) <> ''
         AND supplier_name <> ALL($1::text[])
       ORDER BY supplier_name`,
      [officialSupplierValues]
    );

    const remainingPurchases = await client.query(
      `SELECT DISTINCT supplier_name
       FROM purchase_transactions
       WHERE supplier_name IS NOT NULL
         AND TRIM(supplier_name) <> ''
         AND supplier_name <> ALL($1::text[])
       ORDER BY supplier_name`,
      [officialSupplierValues]
    );

    summary.remainingLegacyProductSuppliers = remainingProducts.rows.map(row => row.supplier_name);
    summary.remainingLegacyPurchaseSuppliers = remainingPurchases.rows.map(row => row.supplier_name);

    await client.query('COMMIT');
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Supplier master data refresh failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

refreshSupplierMasterData();
