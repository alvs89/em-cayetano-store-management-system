// Rebuilds the database into a realistic, presentation-ready hardware store
// dataset while preserving the official product catalog names.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool } = require('pg');
const { buildEmCayetanoCatalog } = require('./em-cayetano-catalog');
const { getOfficialSupplierForProduct } = require('./supplier-master-list');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined
});

const BRANCHES = ['Manggahan', 'San Rafael'];
const CATALOG = buildEmCayetanoCatalog();
const PRESENTATION_NOW = new Date();
const PRESENTATION_YEAR = PRESENTATION_NOW.getFullYear();
const SALES_INVOICE_DOCUMENT_TYPE = 'sales_invoice';
const SALES_INVOICE_SEQUENCE_DIGITS = 6;
const SALES_INVOICE_MAX_NUMBER = Number('9'.repeat(SALES_INVOICE_SEQUENCE_DIGITS));
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TODAY_KEY = formatDateKey(PRESENTATION_NOW);

if (CATALOG.length === 0) {
  throw new Error('E.M. Cayetano product catalog is empty.');
}

function createSeededRandom(seed = 90210) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const random = createSeededRandom(20260607);

function pick(list) {
  return list[Math.floor(random() * list.length) % list.length];
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getCategoryCreditTermsDays(category) {
  const termsByCategory = {
    Steel: 15,
    Electricals: 90,
    Roofing: 120,
    'PVC Pipe / Fittings': 60,
    'Kiln Dry': 120,
    Plywood: 15
  };
  return termsByCategory[category] || 30;
}

function getPurchaseCreditTermsDays(rows) {
  const candidates = rows
    .map(row => getCategoryCreditTermsDays(row.category))
    .filter(days => Number.isInteger(days));
  return candidates.length ? Math.max(...candidates) : 30;
}

function formatDateOnly(date) {
  return formatDateKey(date);
}

function timestampFromDaysAgo(daysAgo, hour = 8, minute = 0) {
  const date = addDays(PRESENTATION_NOW, -daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date > PRESENTATION_NOW ? new Date(PRESENTATION_NOW) : date;
}

function minutesBefore(date, minutes) {
  return new Date(date.getTime() - minutes * 60 * 1000);
}

function formatDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function getDayAge(date) {
  const today = new Date(PRESENTATION_NOW);
  today.setHours(0, 0, 0, 0);
  const other = new Date(date);
  other.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today - other) / ONE_DAY_MS));
}

function computeStatus(stock, minStock) {
  if (stock <= 0) return 'Out of Stock';
  if (stock <= minStock) return 'Low Stock';
  return 'In Stock';
}

function computeVatBreakdown(taxableAmount) {
  const grossAmount = money(taxableAmount);
  const vatableSales = money(grossAmount / 1.12);
  return { vatableSales, vatAmount: money(grossAmount - vatableSales) };
}

function calculateLineProfit({ quantity, unitPrice, unitCost }) {
  const subtotal = money(quantity * unitPrice);
  const costSubtotal = money(quantity * unitCost);
  const grossProfit = money(subtotal - costSubtotal);
  return {
    subtotal,
    costSubtotal,
    grossProfit,
    profitMarginPercent: subtotal > 0 ? money((grossProfit / subtotal) * 100) : 0
  };
}

function getDiscountDetails(type, subtotalAmount) {
  const subtotal = money(subtotalAmount);
  const normalized = String(type || 'none').trim().toLowerCase();
  const presets = {
    none: { type: 'none', label: 'No Discount', amount: 0 },
    store_promo_5: { type: 'store_promo_5', label: 'Store Promo 5%', amount: money(subtotal * 0.05) },
    bulk_project_10: { type: 'bulk_project_10', label: 'Bulk / Project Discount 10%', amount: money(subtotal * 0.10) },
    custom_amount: { type: 'custom_amount', label: 'Manual Discount', amount: Math.min(250, money(subtotal * 0.03)) }
  };
  return presets[normalized] || presets.none;
}

function getItemProfile(item) {
  const name = item.name.toUpperCase();
  const category = item.category;
  const price = Number(item.price || 0);
  let velocity = 1;
  let purchasePack = 10;
  let initialStock = 18;
  let minStock = 6;

  if (/PVC PIPE|ELBOW|COUPLING|TEE|CLEAN OUT|WYE|BUSHG|P-TRAP/.test(name)) {
    velocity = 5;
    purchasePack = 55;
    initialStock = 80;
    minStock = 24;
  } else if (/ROYU|PHELPS|POWERFLEX|PANEL BOX|SAFETY BREAKER|FLOURESCENT|CIRCUIT BREAKER/.test(name)) {
    velocity = 4;
    purchasePack = name.includes('PER MTR') ? 90 : 16;
    initialStock = name.includes('PER MTR') ? 120 : 26;
    minStock = name.includes('PER MTR') ? 35 : 8;
  } else if (/BOYSEN|PRIMER|PAINT|PUTTY|THINNING|ROOF GUARD|WATER PROOFING/.test(name)) {
    velocity = 4;
    purchasePack = name.includes('16L') ? 8 : 24;
    initialStock = name.includes('16L') ? 14 : 36;
    minStock = name.includes('16L') ? 4 : 10;
  } else if (/LONG SPAN|CORRUGATED|GUTTER|PLAIN SHEET|INSULATION|POLYCARBONATE|APO/.test(name)) {
    velocity = 3;
    purchasePack = 24;
    initialStock = 34;
    minStock = 10;
  } else if (/ANGLE BAR|TUBULAR|G\.I PIPE|WIRE|C-PURLINS|STEEL MATTING|FLAT BAR|ROUND BAR|SQUARE BAR/.test(name)) {
    velocity = 3;
    purchasePack = 18;
    initialStock = 30;
    minStock = 9;
  } else if (/COCO|ECO|HARD WOOD|SENEPA|CORNICE|EDGING|PLYWOOD|ORDINARY|MARINE|PHENOLIC|SHERA/.test(name)) {
    velocity = 3;
    purchasePack = 26;
    initialStock = 38;
    minStock = 12;
  }

  if (price >= 2000) {
    initialStock = Math.max(6, Math.round(initialStock * 0.45));
    purchasePack = Math.max(4, Math.round(purchasePack * 0.45));
    minStock = Math.max(3, Math.round(minStock * 0.45));
  }

  if (category === 'PVC Pipe / Fittings') velocity += 1;
  if (category === 'Paints') velocity += 1;

  return { velocity, purchasePack, initialStock, minStock };
}

function getPlanningValues(index, branch, profile) {
  const branchOffset = branch === 'Manggahan' ? 0 : 2;
  const leadTimeDays = 3 + ((index + branchOffset) % 9);
  const safetyStock = Math.max(2, Math.round(profile.minStock * (0.22 + ((index % 4) * 0.04))));
  const averageDailySales = money(0.18 + profile.velocity * 0.17 + ((index + branchOffset) % 5) * 0.05);
  return { leadTimeDays, safetyStock, averageDailySales };
}

function getPurchaseQuantity(row, scale = 1) {
  const variance = 0.78 + random() * 0.55;
  return Math.max(1, Math.round(row.profile.purchasePack * scale * variance));
}

function getSaleQuantity(row, customerType) {
  const name = row.name.toUpperCase();
  const stockRoom = Math.max(0, row.currentStock - row.minStock);
  let maxQty = 2;
  if (/PER MTR/.test(name)) maxQty = customerType === 'contractor' ? 30 : 12;
  else if (/ELBOW|COUPLING|TEE|WYE|BUSHG|CLEAN OUT/.test(name)) maxQty = customerType === 'contractor' ? 14 : 7;
  else if (/PVC PIPE/.test(name)) maxQty = customerType === 'contractor' ? 8 : 4;
  else if (/COCO|ECO|LUMBER|LONG SPAN|CORRUGATED|ANGLE BAR|TUBULAR|C-PURLINS/.test(name)) maxQty = customerType === 'contractor' ? 8 : 3;
  else if (/BOYSEN|PRIMER|PAINT/.test(name)) maxQty = customerType === 'contractor' ? 5 : 2;

  maxQty = Math.min(maxQty, Math.max(1, stockRoom));
  return Math.max(1, Math.floor(1 + random() * maxQty));
}

function getCustomerForSale(branch, customerType) {
  const customers = {
    walk_in: [
      ['Counter Customer', null, branch],
      ['Cash Sale Customer', null, branch],
      ['Walk-in Buyer', null, branch]
    ],
    regular: [
      ['Juan Dela Cruz', null, `${branch} Residential Area`],
      ['Maria Santos', null, `${branch} Home Repair Customer`],
      ['Ramon Bautista', null, `${branch} Barangay Customer`]
    ],
    contractor: [
      ['RCD Builders', '009-184-327-000', 'General Trias, Cavite'],
      ['Manggahan Homeworks Contractor', '006-742-518-000', 'Manggahan, General Trias'],
      ['San Rafael Renovation Services', '010-296-783-000', 'San Rafael, Bulacan']
    ],
    hardware_reseller: [
      ['JLC Hardware Supplies', '008-512-449-000', 'Dasmarinas, Cavite'],
      ['Northline Hardware Trading', '011-743-205-000', 'San Rafael, Bulacan']
    ],
    sister_company: [
      ['E.M. Cayetano Project Supply', '005-231-990-000', 'Inter-branch Account']
    ]
  };
  const selected = pick(customers[customerType] || customers.walk_in);
  return {
    customerName: selected[0],
    customerTin: selected[1],
    customerAddress: selected[2]
  };
}

function chooseSaleItems(branchRows, saleTime, customerType) {
  const hour = saleTime.getHours();
  const preferredCategories = hour < 11
    ? ['Paints', 'PVC Pipe / Fittings', 'Electricals']
    : hour < 15
      ? ['Roofing', 'Steel', 'Kiln Dry', 'Plywood']
      : ['PVC Pipe / Fittings', 'Paints', 'Electricals', 'Roofing'];
  const lineTarget = customerType === 'walk_in'
    ? 1 + Math.floor(random() * 2)
    : 2 + Math.floor(random() * 3);
  const chosen = [];
  const seen = new Set();
  const eligible = branchRows.filter(row => row.currentStock > row.minStock + 1);

  for (let attempts = 0; attempts < 80 && chosen.length < lineTarget; attempts += 1) {
    const categoryPool = random() < 0.75
      ? eligible.filter(row => preferredCategories.includes(row.category))
      : eligible;
    const pool = categoryPool.length ? categoryPool : eligible;
    if (!pool.length) break;
    const weighted = [];
    for (const row of pool) {
      const copies = Math.max(1, row.profile.velocity);
      for (let i = 0; i < copies; i += 1) weighted.push(row);
    }
    const row = pick(weighted);
    if (seen.has(row.key) || row.currentStock <= row.minStock + 1) continue;
    const quantity = getSaleQuantity(row, customerType);
    if (row.currentStock - quantity < 0) continue;
    chosen.push({ row, quantity });
    seen.add(row.key);
  }

  return chosen;
}

function buildEvents(inventoryRowsByBranch) {
  const events = [];
  const branchPurchaseCadence = { Manggahan: 11, 'San Rafael': 14 };

  for (const branch of BRANCHES) {
    const branchRows = inventoryRowsByBranch.get(branch);
    for (let daysAgo = 340; daysAgo >= 2; daysAgo -= branchPurchaseCadence[branch]) {
      const monthScale = daysAgo <= 45 ? 1.1 : daysAgo >= 240 ? 0.86 : 1;
      events.push({
        type: 'purchase',
        branch,
        createdAt: timestampFromDaysAgo(daysAgo, 9 + (daysAgo % 3), 15 + (daysAgo % 20)),
        scale: monthScale,
        lineCount: 3 + (daysAgo % 4),
        rows: branchRows
      });
    }
  }

  for (let daysAgo = 360; daysAgo >= 0; daysAgo -= 1) {
    const saleDate = timestampFromDaysAgo(daysAgo, 8, 0);
    const day = saleDate.getDay();
    const isWeekend = day === 0 || day === 6;
    const isRainySlowDay = daysAgo % 17 === 0 || daysAgo % 29 === 0;
    let count = 0;

    if (daysAgo <= 1) count = daysAgo === 0 ? 5 : 4;
    else if (daysAgo <= 7) count = isWeekend ? 4 : 3;
    else if (daysAgo <= 30) count = isWeekend ? 3 : 2;
    else if (daysAgo <= 120) count = isWeekend ? 2 : (daysAgo % 3 === 0 ? 1 : 0);
    else count = isWeekend ? 1 : (daysAgo % 11 === 0 ? 1 : 0);
    if (isRainySlowDay) count = Math.max(0, count - 1);

    for (let index = 0; index < count; index += 1) {
      const branch = index % 3 === 2 ? 'San Rafael' : pick(BRANCHES);
      const customerType = index === 0 && (isWeekend || daysAgo % 9 === 0)
        ? 'contractor'
        : index === 1 && daysAgo % 5 === 0
          ? 'hardware_reseller'
          : random() < 0.22
            ? 'regular'
            : 'walk_in';
      const hour = [8, 9, 10, 11, 13, 14, 15, 16][(daysAgo + index * 2) % 8];
      const minute = (13 + daysAgo * 7 + index * 11) % 55;
      events.push({
        type: 'sale',
        branch,
        customerType,
        createdAt: timestampFromDaysAgo(daysAgo, hour, minute),
        rows: inventoryRowsByBranch.get(branch)
      });
    }
  }

  for (const [branch, itemPatterns] of [
    ['Manggahan', [/PLASTIC SHEET 8" -- BLUE/, /COLORED GUTTER -- FLASHING/, /BOYSEN - LATEX.*1L/, /COCO -- 2X2X8/]],
    ['San Rafael', [/PVC PIPE -- BLACK 4"/, /PANEL BOX -- 10BR/, /BOYSEN - ENAMEL.*\.25L/, /CORRUGATED \(G\.24\).*8/]]
  ]) {
    itemPatterns.forEach((pattern, index) => {
      const row = inventoryRowsByBranch.get(branch).find(candidate => pattern.test(candidate.name));
      if (row) {
        events.push({
          type: 'stock_out',
          branch,
          row,
          quantity: 1 + (index % 2),
          reason: ['damaged', 'lost_missing', 'internal_use', 'manual_adjustment'][index],
          note: [
            'Removed from sellable stock after warehouse inspection.',
            'Physical count discrepancy recorded during cycle count.',
            'Used for branch repair and counter maintenance.',
            'Corrected after manual stock verification.'
          ][index],
          createdAt: timestampFromDaysAgo(28 - index * 5, 15, 5 + index * 7)
        });
      }
    });
  }

  return events.sort((a, b) => a.createdAt - b.createdAt);
}

async function getAdminActor(client) {
  const adminResult = await client.query(`
    SELECT user_id, full_name
    FROM users
    WHERE username = 'admin'
    ORDER BY user_id
    LIMIT 1
  `);
  if (adminResult.rowCount > 0) return adminResult.rows[0];

  const fallback = await client.query(`
    INSERT INTO users (full_name, username, email, password_hash, role, branch, status, must_change_password)
    VALUES ('System Admin', 'admin', 'admin@emcayetano.com', 'PLACEHOLDER_HASH_FOR_DEV', 'Admin', 'Manggahan', 'Active', false)
    ON CONFLICT (username) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        role = 'Admin',
        status = 'Active',
        branch = 'Manggahan',
        must_change_password = false
    RETURNING user_id, full_name
  `);
  return fallback.rows[0];
}

async function insertMovement(client, movement) {
  if (Number(movement.quantity) <= 0 || Number(movement.previousQuantity) === Number(movement.newQuantity)) return;
  await client.query(
    `INSERT INTO stock_movements (
       inventory_id, product_id, item_name, category, branch, action,
       quantity_changed, previous_quantity, new_quantity, reason, note,
       actor_id, actor_name, created_at, encoded_at, backdate_reason
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      movement.row.inventoryId,
      movement.row.productId,
      movement.row.name,
      movement.row.category,
      movement.row.branch,
      movement.action,
      movement.quantity,
      movement.previousQuantity,
      movement.newQuantity,
      movement.reason,
      movement.note,
      movement.actor.user_id,
      movement.actor.full_name,
      movement.createdAt,
      PRESENTATION_NOW,
      movement.backdateReason || null
    ]
  );
}

function makeBackdateReason(createdAt, noun) {
  const age = getDayAge(createdAt);
  return age > 0 ? `${noun} encoded from verified store records ${age} day(s) after the actual transaction date.` : null;
}

async function insertPurchase(client, event, rows, actor, purchaseSequence) {
  const supplierGroups = new Map();
  const candidates = rows
    .filter(row => row.currentStock <= row.minStock + row.profile.purchasePack * 1.8 || random() < 0.16)
    .sort((a, b) => (b.profile.velocity - a.profile.velocity) || a.name.localeCompare(b.name));
  const selected = candidates.slice(0, event.lineCount);
  if (!selected.length) selected.push(...rows.slice(0, event.lineCount));

  for (const row of selected) {
    const supplier = row.supplier || 'Assorted Hardware Supplier';
    if (!supplierGroups.has(supplier)) supplierGroups.set(supplier, []);
    supplierGroups.get(supplier).push(row);
  }

  let sequence = purchaseSequence;
  for (const [supplier, groupRows] of supplierGroups) {
    const lineSnapshots = groupRows.map(row => {
      const quantity = getPurchaseQuantity(row, event.scale);
      const previousQuantity = row.currentStock;
      row.currentStock += quantity;
      return {
        row,
        quantity,
        unitCost: money(row.costPrice || row.price * 0.82),
        previousQuantity,
        newQuantity: row.currentStock
      };
    });
    const subtotalAmount = money(lineSnapshots.reduce((sum, line) => sum + line.quantity * line.unitCost, 0));
    const totalQuantity = lineSnapshots.reduce((sum, line) => sum + line.quantity, 0);
    const purchaseNumber = `PUR-${event.createdAt.getFullYear()}-${String(sequence).padStart(5, '0')}`;
    const documentType = sequence % 7 === 0 ? 'SI' : 'DR';
    const paymentTerms = sequence % 6 === 0 ? 'credit' : sequence % 4 === 0 ? 'cod' : 'cash';
    const creditTermsDays = paymentTerms === 'credit' ? getPurchaseCreditTermsDays(groupRows) : null;
    const paymentDueDate = paymentTerms === 'credit' ? formatDateOnly(addDays(event.createdAt, creditTermsDays)) : null;
    const paymentStatus = paymentTerms === 'credit' ? 'unpaid' : 'not_applicable';
    const transactionResult = await client.query(
      `INSERT INTO purchase_transactions (
         purchase_number, branch, supplier_name, document_type, document_number,
         payment_terms, credit_terms_days, payment_due_date, payment_status,
         subtotal_amount, total_quantity, remarks, status,
         encoded_by, encoded_by_name, created_at, encoded_at, backdate_reason
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11, $12, 'completed', $13, $14, $15, $16, $17)
       RETURNING purchase_transaction_id`,
      [
        purchaseNumber,
        event.branch,
        supplier,
        documentType,
        `${documentType}-${event.createdAt.getFullYear()}-${String(sequence).padStart(4, '0')}`,
        paymentTerms,
        creditTermsDays,
        paymentDueDate,
        paymentStatus,
        subtotalAmount,
        totalQuantity,
        sequence % 5 === 0
          ? 'Monthly replenishment and supplier delivery received after inventory count.'
          : 'Supplier delivery received and matched against purchase entry.',
        actor.user_id,
        actor.full_name,
        event.createdAt,
        PRESENTATION_NOW,
        makeBackdateReason(event.createdAt, 'Purchase')
      ]
    );

    for (const line of lineSnapshots) {
      await client.query(
        `INSERT INTO purchase_items (
           purchase_transaction_id, inventory_id, product_id, item_name,
           category, branch, quantity_received, unit_cost, subtotal,
           previous_quantity, new_quantity, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          transactionResult.rows[0].purchase_transaction_id,
          line.row.inventoryId,
          line.row.productId,
          line.row.name,
          line.row.category,
          line.row.branch,
          line.quantity,
          line.unitCost,
          money(line.quantity * line.unitCost),
          line.previousQuantity,
          line.newQuantity,
          event.createdAt
        ]
      );

      await insertMovement(client, {
        row: line.row,
        action: 'stock_in',
        quantity: line.quantity,
        previousQuantity: line.previousQuantity,
        newQuantity: line.newQuantity,
        reason: 'purchase_received',
        note: `Supplier delivery recorded from ${purchaseNumber}.`,
        actor,
        createdAt: event.createdAt,
        backdateReason: makeBackdateReason(event.createdAt, 'Stock-in')
      });
    }
    sequence += 1;
  }

  return sequence;
}

async function insertEmergencyPurchase(client, row, saleTime, actor, purchaseSequence) {
  const quantity = getPurchaseQuantity(row, 0.72);
  const previousQuantity = row.currentStock;
  row.currentStock += quantity;
  const unitCost = money(row.costPrice || row.price * 0.82);
  const createdAt = minutesBefore(saleTime, 95);
  const purchaseNumber = `PUR-${createdAt.getFullYear()}-${String(purchaseSequence).padStart(5, '0')}`;
  const transactionResult = await client.query(
    `INSERT INTO purchase_transactions (
       purchase_number, branch, supplier_name, document_type, document_number,
       payment_terms, credit_terms_days, payment_due_date, payment_status,
       subtotal_amount, total_quantity, remarks, status,
       encoded_by, encoded_by_name, created_at, encoded_at, backdate_reason
     )
     VALUES ($1, $2, $3, 'DR', $4, 'cod', NULL, NULL, 'not_applicable', $5, $6, $7, 'completed', $8, $9, $10, $11, $12)
     RETURNING purchase_transaction_id`,
    [
      purchaseNumber,
      row.branch,
      row.supplier || 'Assorted Hardware Supplier',
      `DR-EMG-${String(purchaseSequence).padStart(4, '0')}`,
      money(quantity * unitCost),
      quantity,
      'Emergency purchase to cover same-day counter demand.',
      actor.user_id,
      actor.full_name,
      createdAt,
      PRESENTATION_NOW,
      makeBackdateReason(createdAt, 'Emergency purchase')
    ]
  );
  await client.query(
    `INSERT INTO purchase_items (
       purchase_transaction_id, inventory_id, product_id, item_name,
       category, branch, quantity_received, unit_cost, subtotal,
       previous_quantity, new_quantity, created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      transactionResult.rows[0].purchase_transaction_id,
      row.inventoryId,
      row.productId,
      row.name,
      row.category,
      row.branch,
      quantity,
      unitCost,
      money(quantity * unitCost),
      previousQuantity,
      row.currentStock,
      createdAt
    ]
  );
  await insertMovement(client, {
    row,
    action: 'stock_in',
    quantity,
    previousQuantity,
    newQuantity: row.currentStock,
    reason: 'purchase_received',
    note: `Supplier delivery recorded from ${purchaseNumber}.`,
    actor,
    createdAt,
    backdateReason: makeBackdateReason(createdAt, 'Emergency stock-in')
  });
  return purchaseSequence + 1;
}

async function insertSale(client, event, actor, salesSequences, invoiceSequences, purchaseSequence) {
  let linePlans = chooseSaleItems(event.rows, event.createdAt, event.customerType);
  if (!linePlans.length) return { salesSequences, invoiceSequences, purchaseSequence, created: false };

  for (const plan of linePlans) {
    if (plan.row.currentStock - plan.quantity < plan.row.minStock) {
      purchaseSequence = await insertEmergencyPurchase(client, plan.row, event.createdAt, actor, purchaseSequence);
    }
  }

  linePlans = linePlans.filter(plan => plan.row.currentStock >= plan.quantity);
  if (!linePlans.length) return { salesSequences, invoiceSequences, purchaseSequence, created: false };

  const year = event.createdAt.getFullYear();
  const yearSequence = salesSequences.get(year) || 1;
  salesSequences.set(year, yearSequence + 1);
  const salesNumber = `SALE-${year}-${String(yearSequence).padStart(5, '0')}`;
  const invoiceSequence = invoiceSequences.get(event.branch) || 1;
  invoiceSequences.set(event.branch, invoiceSequence + 1);
  const officialInvoiceNumber = String(invoiceSequence).padStart(SALES_INVOICE_SEQUENCE_DIGITS, '0');
  const discountType = event.customerType === 'contractor'
    ? 'bulk_project_10'
    : event.customerType === 'hardware_reseller'
      ? 'store_promo_5'
      : random() < 0.08
        ? 'custom_amount'
        : 'none';
  const paymentMethod = event.customerType === 'contractor'
    ? 'bank_transfer'
    : event.customerType === 'hardware_reseller' || random() < 0.22
      ? 'gcash'
      : 'cash';
  const lineSnapshots = linePlans.map(plan => {
    const previousQuantity = plan.row.currentStock;
    plan.row.currentStock -= plan.quantity;
    const unitPrice = money(plan.row.price);
    const unitCost = money(plan.row.costPrice || unitPrice * 0.82);
    const profit = calculateLineProfit({ quantity: plan.quantity, unitPrice, unitCost });
    return {
      row: plan.row,
      quantity: plan.quantity,
      previousQuantity,
      newQuantity: plan.row.currentStock,
      unitPrice,
      unitCost,
      ...profit
    };
  });
  const totalQuantity = lineSnapshots.reduce((sum, line) => sum + line.quantity, 0);
  const subtotalAmount = money(lineSnapshots.reduce((sum, line) => sum + line.subtotal, 0));
  const discountDetails = getDiscountDetails(discountType, subtotalAmount);
  const discountAmount = Math.min(discountDetails.amount, subtotalAmount);
  const deliveryCharge = event.customerType === 'contractor' && random() < 0.35 ? 350 : 0;
  const taxableSalesAmount = money(Math.max(subtotalAmount - discountAmount, 0));
  const totalAmount = money(taxableSalesAmount + deliveryCharge);
  const { vatableSales, vatAmount } = computeVatBreakdown(taxableSalesAmount);
  const amountReceived = paymentMethod === 'cash'
    ? money(Math.ceil(totalAmount / 100) * 100)
    : totalAmount;
  const changeAmount = paymentMethod === 'cash' ? money(amountReceived - totalAmount) : 0;
  const customer = getCustomerForSale(event.branch, event.customerType);
  const paymentReference = paymentMethod === 'gcash'
    ? `GCASH-${String(7000000000 + Math.floor(random() * 999999999)).slice(0, 10)}`
    : paymentMethod === 'bank_transfer'
      ? `BANK-${event.createdAt.getFullYear()}${String(event.createdAt.getMonth() + 1).padStart(2, '0')}-${String(invoiceSequence).padStart(5, '0')}`
      : null;

  const transactionResult = await client.query(
    `INSERT INTO sales_transactions (
       sales_number, branch, customer_type, customer_name, customer_tin,
       customer_address, total_quantity, subtotal_amount, discount_amount,
       discount_type, discount_label, delivery_charge, vatable_sales,
       vat_amount, total_amount, payment_method, amount_received,
       change_amount, payment_reference, payment_confirmed,
       payment_confirmed_by, payment_confirmed_by_name, payment_confirmed_at,
       status, transaction_type, sold_by, sold_by_name, remarks,
       created_at, encoded_at, backdate_reason, official_invoice_number,
       official_invoice_expected_number, official_invoice_exception_reason
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
             $14, $15, $16, $17, $18, $19, true, $20, $21, $22,
             'completed', 'sale', $23, $24, $25, $26, $27, $28, $29, $30, NULL)
     RETURNING sales_transaction_id`,
    [
      salesNumber,
      event.branch,
      event.customerType,
      customer.customerName,
      customer.customerTin,
      customer.customerAddress,
      totalQuantity,
      subtotalAmount,
      discountAmount,
      discountDetails.type,
      discountDetails.label,
      deliveryCharge,
      vatableSales,
      vatAmount,
      totalAmount,
      paymentMethod,
      amountReceived,
      changeAmount,
      paymentReference,
      actor.user_id,
      actor.full_name,
      event.createdAt,
      actor.user_id,
      actor.full_name,
      `${event.customerType.replace(/_/g, ' ')} sale recorded through counter sales workflow.`,
      event.createdAt,
      PRESENTATION_NOW,
      makeBackdateReason(event.createdAt, 'Sale'),
      officialInvoiceNumber,
      officialInvoiceNumber
    ]
  );

  for (const line of lineSnapshots) {
    await client.query(
      `INSERT INTO sales_items (
         sales_transaction_id, item_type, inventory_id, product_id,
         is_inventory_item, item_name, category, branch, quantity_sold,
         unit_price, unit_cost_at_sale, subtotal, cost_subtotal,
         gross_profit, profit_margin_percent, previous_quantity,
         new_quantity, created_at
       )
       VALUES ($1, 'inventory', $2, $3, true, $4, $5, $6, $7, $8, $9,
               $10, $11, $12, $13, $14, $15, $16)`,
      [
        transactionResult.rows[0].sales_transaction_id,
        line.row.inventoryId,
        line.row.productId,
        line.row.name,
        line.row.category,
        line.row.branch,
        line.quantity,
        line.unitPrice,
        line.unitCost,
        line.subtotal,
        line.costSubtotal,
        line.grossProfit,
        line.profitMarginPercent,
        line.previousQuantity,
        line.newQuantity,
        event.createdAt
      ]
    );

    await insertMovement(client, {
      row: line.row,
      action: 'stock_out',
      quantity: line.quantity,
      previousQuantity: line.previousQuantity,
      newQuantity: line.newQuantity,
      reason: 'sales',
      note: `Sales Recording ${salesNumber}.`,
      actor,
      createdAt: event.createdAt,
      backdateReason: makeBackdateReason(event.createdAt, 'Sales stock-out')
    });
  }

  return { salesSequences, invoiceSequences, purchaseSequence, created: true };
}

async function refreshDemoInventory() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const admin = await getAdminActor(client);

    await client.query(`
      TRUNCATE TABLE
        inventory_change_requests,
        purchase_items,
        purchase_transactions,
        sales_items,
        sales_transactions,
        stock_movements,
        archived_inventory,
        backup_logs,
        system_logs,
        audit_logs,
        branch_inventory,
        products
      RESTART IDENTITY
      CASCADE
    `);

    await client.query(`
      DELETE FROM users
      WHERE username <> 'admin'
         OR user_id <> $1
    `, [admin.user_id]);

    await client.query(`
      UPDATE users
      SET full_name = 'System Admin',
          email = COALESCE(NULLIF(TRIM(email), ''), 'admin@emcayetano.com'),
          role = 'Admin',
          branch = 'Manggahan',
          status = 'Active',
          must_change_password = false,
          otp_code = NULL,
          otp_expires = NULL,
          login_otp_code = NULL,
          login_otp_expires = NULL,
          reset_otp_code = NULL,
          reset_otp_expires = NULL
      WHERE user_id = $1
    `, [admin.user_id]);

    await client.query(`DELETE FROM invoice_number_sequences WHERE document_type = $1`, [SALES_INVOICE_DOCUMENT_TYPE]);

    const inventoryRowsByBranch = new Map(BRANCHES.map(branch => [branch, []]));
    const inventoryByNameAndBranch = new Map();

    for (let index = 0; index < CATALOG.length; index += 1) {
      const item = CATALOG[index];
      const profile = getItemProfile(item);
      const supplier = getOfficialSupplierForProduct(item, index);
      const productCreatedAt = timestampFromDaysAgo(360 - (index % 35), 8, 5 + (index % 40));
      const productResult = await client.query(
        `INSERT INTO products (name, category, supplier_name, default_selling_price, cost_price, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING product_id`,
        [item.name, item.category, supplier, item.price, item.costPrice, productCreatedAt]
      );
      const productId = productResult.rows[0].product_id;

      for (const branch of BRANCHES) {
        const branchMultiplier = branch === 'Manggahan' ? 1.08 : 0.92;
        const branchJitter = 0.86 + ((index % 9) * 0.035);
        const minStock = Math.max(2, Math.round(profile.minStock * branchMultiplier));
        const initialStock = Math.max(minStock + 4, Math.round(profile.initialStock * branchMultiplier * branchJitter));
        const planning = getPlanningValues(index, branch, profile);
        const inventoryResult = await client.query(
          `INSERT INTO branch_inventory (
             product_id, branch, stock_level, min_stock_level, lead_time_days,
             safety_stock, average_daily_sales, average_daily_sales_mode,
             status, last_updated
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'auto', $8, $9)
           RETURNING inventory_id`,
          [
            productId,
            branch,
            initialStock,
            minStock,
            planning.leadTimeDays,
            planning.safetyStock,
            planning.averageDailySales,
            computeStatus(initialStock, minStock),
            timestampFromDaysAgo(0, 16, 45)
          ]
        );

        const row = {
          key: `${branch}|${item.name}`,
          inventoryId: inventoryResult.rows[0].inventory_id,
          productId,
          name: item.name,
          category: item.category,
          supplier,
          price: Number(item.price || 0),
          costPrice: Number(item.costPrice || 0),
          branch,
          minStock,
          leadTimeDays: planning.leadTimeDays,
          safetyStock: planning.safetyStock,
          averageDailySales: planning.averageDailySales,
          profile,
          currentStock: initialStock
        };

        inventoryRowsByBranch.get(branch).push(row);
        inventoryByNameAndBranch.set(row.key, row);

        await insertMovement(client, {
          row,
          action: 'initial_stock',
          quantity: initialStock,
          previousQuantity: 0,
          newQuantity: initialStock,
          reason: 'beginning_balance',
          note: 'Opening balance from prior physical count before presentation period.',
          actor: admin,
          createdAt: timestampFromDaysAgo(360, 7, 45 + (index % 10)),
          backdateReason: 'Opening balance migrated from verified store count sheets.'
        });
      }
    }

    const events = buildEvents(inventoryRowsByBranch);
    const salesSequences = new Map([[PRESENTATION_YEAR - 1, 1], [PRESENTATION_YEAR, 1]]);
    const invoiceSequences = new Map(BRANCHES.map(branch => [branch, 1]));
    let purchaseSequence = 1;
    let salesCreated = 0;

    for (const event of events) {
      if (event.type === 'purchase') {
        purchaseSequence = await insertPurchase(client, event, event.rows, admin, purchaseSequence);
      } else if (event.type === 'sale') {
        const result = await insertSale(client, event, admin, salesSequences, invoiceSequences, purchaseSequence);
        salesCreated += result.created ? 1 : 0;
        purchaseSequence = result.purchaseSequence;
      } else if (event.type === 'stock_out' && event.row.currentStock > event.quantity) {
        const previousQuantity = event.row.currentStock;
        event.row.currentStock -= event.quantity;
        await insertMovement(client, {
          row: event.row,
          action: 'stock_out',
          quantity: event.quantity,
          previousQuantity,
          newQuantity: event.row.currentStock,
          reason: event.reason,
          note: event.note,
          actor: admin,
          createdAt: event.createdAt,
          backdateReason: makeBackdateReason(event.createdAt, 'Stock adjustment')
        });
      }
    }

    const forcedStockOutKeys = [
      'Manggahan|ELBOW 1/8 45deg -- ORANGE 6"',
      'Manggahan|C-PURLINS MAKAPAL -- WALL CLIP',
      'San Rafael|BOYSEN - WATER PROOFING -- 7760 PLEXIBOND 16L',
      'San Rafael|PVC PIPE -- BLACK 4"'
    ];
    for (const key of forcedStockOutKeys) {
      const row = inventoryByNameAndBranch.get(key);
      if (!row || row.currentStock <= 0) continue;
      const previousQuantity = row.currentStock;
      row.currentStock = 0;
      await insertMovement(client, {
        row,
        action: 'adjustment',
        quantity: previousQuantity,
        previousQuantity,
        newQuantity: 0,
        reason: 'manual_adjustment',
        note: 'Closed out remaining stock after obsolete or unavailable item verification.',
        actor: admin,
        createdAt: timestampFromDaysAgo(2, 16, 10),
        backdateReason: 'Inventory adjustment encoded from approved cycle-count worksheet.'
      });
    }

    const forcedLowStockKeys = [
      'Manggahan|MARINE -- 3/4 L-M (imp)',
      'Manggahan|GUTTER -- GUTTER 8X24 MAKAPAL',
      'San Rafael|ORDINARY -- 3/4 L-O (imp)',
      'San Rafael|PANEL BOX -- 10BR',
      'San Rafael|CORRUGATED (G.24) MAKAPAL -- 8'
    ];
    for (const key of forcedLowStockKeys) {
      const row = inventoryByNameAndBranch.get(key);
      if (!row || row.currentStock <= row.minStock) continue;
      const previousQuantity = row.currentStock;
      row.currentStock = Math.max(1, row.minStock - 1);
      await insertMovement(client, {
        row,
        action: 'adjustment',
        quantity: previousQuantity - row.currentStock,
        previousQuantity,
        newQuantity: row.currentStock,
        reason: 'manual_adjustment',
        note: 'Cycle-count adjustment flagged item for replenishment monitoring.',
        actor: admin,
        createdAt: timestampFromDaysAgo(1, 15, 35),
        backdateReason: 'Inventory adjustment encoded after branch count reconciliation.'
      });
    }

    for (const branchRows of inventoryRowsByBranch.values()) {
      for (const row of branchRows) {
        await client.query(
          `UPDATE branch_inventory
           SET stock_level = $1,
               status = $2,
               last_updated = $3
           WHERE inventory_id = $4`,
          [row.currentStock, computeStatus(row.currentStock, row.minStock), timestampFromDaysAgo(0, 16, 45), row.inventoryId]
        );
      }
    }

    const archivePlans = [
      ['Manggahan|PLAIN SHEET (G.26) MANIPIS -- 3X8X26', 'duplicate_record', 'Duplicate record archived after master catalog cleanup.'],
      ['Manggahan|C-PURLINS MAKAPAL -- WALL ANGLE', 'discontinued', 'Old wall angle listing discontinued after supplier code change.'],
      ['Manggahan|FIBER GLASS -- 8', 'obsolete_item', 'Obsolete roofing item retained for archive audit trail.'],
      ['San Rafael|COUPLING -- BLACK 3"', 'supplier_change', 'Old supplier item archived after replacement with updated vendor record.'],
      ['San Rafael|FLOURESCENT LAMP only -- Firefly 8w', 'duplicate_record', 'Duplicate lamp record archived after product list normalization.'],
      ['San Rafael|ORDINARY -- 1/4 L-O', 'obsolete_item', 'Old plywood listing retained in archive for reporting demonstration.']
    ];

    for (let index = 0; index < archivePlans.length; index += 1) {
      const [key, reason, note] = archivePlans[index];
      const row = inventoryByNameAndBranch.get(key);
      if (!row) continue;
      await client.query(
        `INSERT INTO archived_inventory (
           original_inventory_id, product_id, name, category, supplier_name,
           default_selling_price, cost_price, branch, stock_level,
           min_stock_level, lead_time_days, safety_stock, average_daily_sales,
           average_daily_sales_mode, status, last_updated, archived_at,
           archive_reason, archive_reason_note, archived_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 'auto', $14, $15, $16, $17, $18, $19)`,
        [
          row.inventoryId,
          row.productId,
          `${row.name} - Old Record`,
          row.category,
          row.supplier,
          row.price,
          row.costPrice,
          row.branch,
          index % 2 === 0 ? 0 : Math.max(1, Math.floor(row.minStock / 2)),
          row.minStock,
          row.leadTimeDays,
          row.safetyStock,
          row.averageDailySales,
          index % 2 === 0 ? 'Out of Stock' : 'Low Stock',
          timestampFromDaysAgo(95 - index * 8, 10, 20),
          timestampFromDaysAgo(88 - index * 7, 14, 10),
          reason,
          note,
          admin.user_id
        ]
      );
    }

    const requestRows = [
      inventoryByNameAndBranch.get('Manggahan|BOYSEN - LATEX (STONE) -- B 701 FLAT LATEX WHT 4L'),
      inventoryByNameAndBranch.get('Manggahan|PVC PIPE -- ORANGE 1/2'),
      inventoryByNameAndBranch.get('San Rafael|PANEL BOX -- 2BR'),
      inventoryByNameAndBranch.get('San Rafael|CORRUGATED - RED/GRN -- RED/GREEN 10')
    ].filter(Boolean);

    for (let index = 0; index < requestRows.length; index += 1) {
      const row = requestRows[index];
      const status = ['approved', 'approved', 'rejected', 'pending'][index];
      const requestedAt = timestampFromDaysAgo(21 - index * 4, 10, 25);
      const reviewedAt = status === 'pending' ? null : timestampFromDaysAgo(20 - index * 4, 14, 30);
      await client.query(
        `INSERT INTO inventory_change_requests (
           request_type, branch, inventory_id, item_name, requested_payload,
           current_snapshot, status, requested_by, requested_by_name,
           reviewed_by, reviewed_by_name, review_note, requested_at, reviewed_at
         )
         VALUES ('edit_item', $1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          row.branch,
          row.inventoryId,
          row.name,
          JSON.stringify({
            min_stock_level: row.minStock + 2,
            safety_stock: row.safetyStock + 1,
            average_daily_sales: money(row.averageDailySales + 0.2)
          }),
          JSON.stringify({
            stock_level: row.currentStock,
            min_stock_level: row.minStock,
            safety_stock: row.safetyStock,
            average_daily_sales: row.averageDailySales
          }),
          status,
          admin.user_id,
          admin.full_name,
          status === 'pending' ? null : admin.user_id,
          status === 'pending' ? null : admin.full_name,
          status === 'rejected'
            ? 'Rejected because the submitted threshold exceeded recent sales velocity.'
            : status === 'approved'
              ? 'Approved after checking purchase lead time and movement history.'
              : null,
          requestedAt,
          reviewedAt
        ]
      );
    }

    for (const branch of BRANCHES) {
      await client.query(
        `INSERT INTO branch_settings (branch, daily_sales_target, updated_by, updated_by_name, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (branch) DO UPDATE
         SET daily_sales_target = EXCLUDED.daily_sales_target,
             updated_by = EXCLUDED.updated_by,
             updated_by_name = EXCLUDED.updated_by_name,
             updated_at = EXCLUDED.updated_at`,
        [branch, branch === 'Manggahan' ? 42000 : 32000, admin.user_id, admin.full_name, timestampFromDaysAgo(14, 9, 0)]
      );
    }

    const auditEntries = [
      ['inventory_demo_seed', 'REFRESH_PRESENTATION_DATA', 'Loaded normalized product, inventory, sales, purchases, archive, and audit demo records.', 0],
      ['sales', 'BACKDATE_SALES_REVIEW', 'Reviewed backdated sales entries against official invoice sequence.', 1],
      ['inventory', 'LOW_STOCK_REVIEW', 'Reviewed low-stock and out-of-stock items for dashboard alert demonstration.', 2],
      ['purchase', 'SUPPLIER_DELIVERY_RECONCILIATION', 'Matched supplier delivery documents against purchase line items.', 5],
      ['archive', 'ARCHIVE_REVIEW', 'Archived old duplicate and obsolete item records for archive module demonstration.', 12],
      ['maintenance', 'DATA_INTEGRITY_CHECK', 'Completed final data integrity check before client presentation.', 0]
    ];
    for (const [targetType, action, reason, daysAgo] of auditEntries) {
      await client.query(
        `INSERT INTO audit_logs (actor_id, actor_name, target_type, action, reason, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [
          admin.user_id,
          admin.full_name,
          targetType,
          action,
          reason,
          JSON.stringify({
            branchScope: BRANCHES,
            seededFor: 'professional demonstration and QA evaluation',
            dateDistribution: ['today', 'yesterday', 'last_7_days', 'last_30_days', 'previous_months', 'last_year']
          }),
          timestampFromDaysAgo(daysAgo, 16, 40)
        ]
      );
    }

    const systemEntries = [
      ['DEMO_DATA_REFRESH', 'info', 'Professional presentation dataset loaded successfully.', 0],
      ['LOW_STOCK_ALERT_SCAN', 'warning', 'Low-stock alerts recalculated after latest sales and cycle-count adjustments.', 0],
      ['REPORT_CACHE_REFRESH', 'info', 'Sales, purchases, and movement report views refreshed after seed operation.', 1],
      ['SECURITY_AUDIT', 'info', 'Admin-only user baseline confirmed for final demonstration database.', 2],
      ['SUPPLIER_RECONCILIATION', 'info', 'Supplier names normalized against master list.', 8]
    ];
    for (const [eventType, severity, message, daysAgo] of systemEntries) {
      await client.query(
        `INSERT INTO system_logs (event_type, severity, message, context, actor_id, actor_name, is_security, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
        [
          eventType,
          severity,
          message,
          JSON.stringify({ source: 'refresh-demo-inventory.js', presentationReady: true }),
          admin.user_id,
          admin.full_name,
          eventType === 'SECURITY_AUDIT',
          timestampFromDaysAgo(daysAgo, 17, 5)
        ]
      );
    }

    await client.query(
      `INSERT INTO backup_logs (action, actor_id, actor_name, details, created_at)
       VALUES ('backup', $1, $2, $3::jsonb, $4)`,
      [
        admin.user_id,
        admin.full_name,
        JSON.stringify({
          reason: 'Pre-presentation database snapshot after normalized data refresh.',
          format: 'plain_sql',
          scope: ['inventory', 'sales', 'purchases', 'archive', 'audit']
        }),
        timestampFromDaysAgo(0, 17, 20)
      ]
    );

    for (const branch of BRANCHES) {
      const lastInvoiceNumber = (invoiceSequences.get(branch) || 1) - 1;
      await client.query(
        `INSERT INTO invoice_number_sequences (document_type, invoice_year, branch, last_number, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (document_type, invoice_year, branch) DO UPDATE
         SET last_number = EXCLUDED.last_number,
             updated_at = EXCLUDED.updated_at`,
        [
          SALES_INVOICE_DOCUMENT_TYPE,
          PRESENTATION_YEAR,
          branch,
          Math.min(lastInvoiceNumber, SALES_INVOICE_MAX_NUMBER),
          timestampFromDaysAgo(0, 17, 0)
        ]
      );
    }

    const summary = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM products) AS products,
        (SELECT COUNT(*) FROM branch_inventory) AS inventory,
        (SELECT COUNT(*) FROM sales_transactions) AS sales,
        (SELECT COUNT(*) FROM sales_items) AS sales_items,
        (SELECT COUNT(*) FROM purchase_transactions) AS purchases,
        (SELECT COUNT(*) FROM purchase_items) AS purchase_items,
        (SELECT COUNT(*) FROM stock_movements) AS movements,
        (SELECT COUNT(*) FROM archived_inventory) AS archived,
        (SELECT COUNT(*) FROM inventory_change_requests) AS change_requests,
        (SELECT COUNT(*) FROM audit_logs) AS audit_logs,
        (SELECT COUNT(*) FROM system_logs) AS system_logs,
        (SELECT COUNT(*) FROM backup_logs) AS backup_logs,
        (SELECT COUNT(*) FROM branch_inventory WHERE status = 'Low Stock') AS low_stock,
        (SELECT COUNT(*) FROM branch_inventory WHERE status = 'Out of Stock') AS out_of_stock,
        (SELECT COUNT(DISTINCT DATE(created_at)) FROM sales_transactions) AS sales_days
    `);

    await client.query('COMMIT');

    console.log(JSON.stringify({
      status: 'presentation_data_ready',
      generatedAt: PRESENTATION_NOW.toISOString(),
      anchorDate: TODAY_KEY,
      salesCreated,
      counts: summary.rows[0]
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to refresh presentation data:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

refreshDemoInventory();
