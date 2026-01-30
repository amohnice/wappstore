import { pgTable, uuid, varchar, text, decimal, integer, boolean, timestamp, jsonb, index, unique } from 'drizzle-orm/pg-core';

// =============================================
// BUSINESSES (TENANTS)
// =============================================
export const businesses = pgTable('businesses', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    category: varchar('category', { length: 100 }),
    phoneNumber: varchar('phone_number', { length: 20 }).unique().notNull(),
    whatsappNumberId: varchar('whatsapp_number_id', { length: 100 }).unique(),

    // Payment details (encrypted)
    paybillNumber: varchar('paybill_number', { length: 20 }),
    tillNumber: varchar('till_number', { length: 20 }),

    // Verification
    verificationStatus: varchar('verification_status', { length: 20 }).default('PENDING'),
    nationalIdHash: varchar('national_id_hash', { length: 64 }),
    riskScore: integer('risk_score').default(0),

    // Subscription
    subscriptionTier: varchar('subscription_tier', { length: 20 }).default('STARTER'),
    subscriptionStatus: varchar('subscription_status', { length: 20 }).default('PENDING_PAYMENT'),
    subscriptionPaidAt: timestamp('subscription_paid_at'),

    // Settings
    aiPersona: text('ai_persona'),
    defaultLanguage: varchar('default_language', { length: 10 }).default('en'),
    prefersCod: boolean('prefers_cod').default(true),
    paymentIntegrationEnabled: boolean('payment_integration_enabled').default(false),

    // Status
    isActive: boolean('is_active').default(true),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    phoneIdx: index('businesses_phone_idx').on(table.phoneNumber),
}));

// =============================================
// PRODUCTS
// =============================================
export const products = pgTable('products', {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),

    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    category: varchar('category', { length: 100 }),

    // Pricing
    basePrice: decimal('base_price', { precision: 10, scale: 2 }).notNull(),
    minimumPrice: decimal('minimum_price', { precision: 10, scale: 2 }).notNull(),

    // Media
    images: jsonb('images').default([]),

    // AI Search (pgvector)
    imageEmbedding: text('image_embedding'), // vector(768) in raw SQL
    textEmbedding: text('text_embedding'),

    // Discounts
    discountPrice: decimal('discount_price', { precision: 10, scale: 2 }),
    discountEndsAt: timestamp('discount_ends_at'),

    // Status
    isActive: boolean('is_active').default(true),
    stockQuantity: integer('stock_quantity').default(0),
    lowStockThreshold: integer('low_stock_threshold').default(5),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    businessIdx: index('products_business_idx').on(table.businessId),
    categoryIdx: index('products_category_idx').on(table.category),
    activeIdx: index('products_active_idx').on(table.isActive),
}));

// =============================================
// PRODUCT VARIANTS
// =============================================
export const productVariants = pgTable('product_variants', {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),

    name: varchar('name', { length: 100 }).notNull(), // e.g., "Large/Red"
    sku: varchar('sku', { length: 100 }),

    priceAdjustment: decimal('price_adjustment', { precision: 10, scale: 2 }).default('0'),
    stockQuantity: integer('stock_quantity').default(0),
    lowStockThreshold: integer('low_stock_threshold').default(5),

    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    productIdx: index('variants_product_idx').on(table.productId),
}));

// =============================================
// CUSTOMERS
// =============================================
export const customers = pgTable('customers', {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),

    phoneNumber: varchar('phone_number', { length: 20 }).notNull(),
    name: varchar('name', { length: 255 }),

    // Preferences
    preferredLanguage: varchar('preferred_language', { length: 10 }).default('en'),

    // Stats
    totalOrders: integer('total_orders').default(0),
    totalSpent: decimal('total_spent', { precision: 10, scale: 2 }).default('0'),
    lastOrderAt: timestamp('last_order_at'),

    // Consent
    optedInAt: timestamp('opted_in_at'),
    optedOutAt: timestamp('opted_out_at'),

    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    businessPhoneIdx: unique('customers_business_phone_unique').on(table.businessId, table.phoneNumber),
    phoneIdx: index('customers_phone_idx').on(table.phoneNumber),
}));

// =============================================
// CONVERSATIONS
// =============================================
export const conversations = pgTable('conversations', {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
    customerPhone: varchar('customer_phone', { length: 20 }).notNull(),

    // State machine
    currentState: varchar('current_state', { length: 50 }).default('BROWSING'),

    // Session data
    cartItems: jsonb('cart_items').default([]),
    contextMemory: jsonb('context_memory').default({}),
    deliveryAddress: jsonb('delivery_address'),
    latitude: decimal('latitude', { precision: 10, scale: 7 }),
    longitude: decimal('longitude', { precision: 10, scale: 7 }),

    // Metadata
    lastMessageAt: timestamp('last_message_at').defaultNow(),
    handoffToHuman: boolean('handoff_to_human').default(false),

    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    businessPhoneIdx: unique('conversations_business_phone_unique').on(table.businessId, table.customerPhone),
    stateIdx: index('conversations_state_idx').on(table.currentState),
}));

// =============================================
// MESSAGES (Evidence Vault)
// =============================================
export const messages = pgTable('messages', {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
    conversationId: uuid('conversation_id').references(() => conversations.id),

    direction: varchar('direction', { length: 10 }).notNull(), // INBOUND | OUTBOUND
    content: text('content').notNull(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(), // SHA-256

    whatsappMessageId: varchar('whatsapp_message_id', { length: 100 }),

    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    conversationIdx: index('messages_conversation_idx').on(table.conversationId),
    createdIdx: index('messages_created_idx').on(table.createdAt),
}));

// =============================================
// ORDERS
// =============================================
export const orders = pgTable('orders', {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
    customerId: uuid('customer_id').references(() => customers.id),

    orderNumber: varchar('order_number', { length: 50 }).unique().notNull(),

    // Amounts
    subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull(),
    deliveryFee: decimal('delivery_fee', { precision: 10, scale: 2 }).default('0'),
    totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),

    // Items (denormalized for speed)
    items: jsonb('items').notNull(),

    // Delivery
    deliveryAddress: jsonb('delivery_address'),
    deliveryZone: varchar('delivery_zone', { length: 100 }),
    latitude: decimal('latitude', { precision: 10, scale: 7 }),
    longitude: decimal('longitude', { precision: 10, scale: 7 }),

    // Payment
    paymentMethod: varchar('payment_method', { length: 50 }),
    paymentStatus: varchar('payment_status', { length: 20 }).default('PENDING'),
    mpesaReceipt: varchar('mpesa_receipt', { length: 100 }),

    // Order status
    status: varchar('status', { length: 20 }).default('PENDING'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    paidAt: timestamp('paid_at'),
    completedAt: timestamp('completed_at'),
}, (table) => ({
    businessIdx: index('orders_business_idx').on(table.businessId),
    customerIdx: index('orders_customer_idx').on(table.customerId),
    statusIdx: index('orders_status_idx').on(table.status),
    orderNumberIdx: index('orders_number_idx').on(table.orderNumber),
}));

// =============================================
// TRANSACTIONS (Ledger)
// =============================================
export const transactions = pgTable('transactions', {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
    orderId: uuid('order_id').references(() => orders.id),

    type: varchar('type', { length: 20 }).notNull(), // SALE | REFUND | FEE | PAYOUT

    // Financial breakdown
    grossAmount: decimal('gross_amount', { precision: 10, scale: 2 }).notNull(),
    vatAmount: decimal('vat_amount', { precision: 10, scale: 2 }).default('0'),
    platformFee: decimal('platform_fee', { precision: 10, scale: 2 }).default('0'),
    netAmount: decimal('net_amount', { precision: 10, scale: 2 }).notNull(),

    // Payment details
    mpesaReceipt: varchar('mpesa_receipt', { length: 100 }).unique(),
    paymentPhone: varchar('payment_phone', { length: 20 }),

    status: varchar('status', { length: 20 }).default('PENDING'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    processedAt: timestamp('processed_at'),
}, (table) => ({
    businessIdx: index('transactions_business_idx').on(table.businessId),
    orderIdx: index('transactions_order_idx').on(table.orderId),
    statusIdx: index('transactions_status_idx').on(table.status),
}));

// =============================================
// AUDIT LOGS
// =============================================
export const auditLogs = pgTable('audit_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id').references(() => businesses.id),
    userId: uuid('user_id'),

    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 50 }),
    resourceId: uuid('resource_id'),

    changes: jsonb('changes'),
    ipAddress: varchar('ip_address', { length: 45 }),

    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    businessIdx: index('audit_logs_business_idx').on(table.businessId),
    createdIdx: index('audit_logs_created_idx').on(table.createdAt),
}));

// =============================================
// TYPES (for TypeScript)
// =============================================
export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
