-- Migration: 0001_initial_schema.sql
-- Created: 2026-01-26
-- Description: Initial database schema with multi-tenancy support

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================
-- BUSINESSES TABLE
-- =============================================

CREATE TABLE businesses (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            name VARCHAR(255) NOT NULL,
                            category VARCHAR(100),
                            phone_number VARCHAR(20) UNIQUE NOT NULL,
                            whatsapp_number_id VARCHAR(100) UNIQUE,

    -- Payment details
                            paybill_number VARCHAR(20),
                            till_number VARCHAR(20),

    -- Verification
                            verification_status VARCHAR(20) DEFAULT 'PENDING',
                            national_id_hash VARCHAR(64),
                            risk_score INTEGER DEFAULT 0,

    -- Subscription
                            subscription_tier VARCHAR(20) DEFAULT 'STARTER',
                            subscription_status VARCHAR(20) DEFAULT 'ACTIVE',

    -- Settings
                            ai_persona TEXT,
                            default_language VARCHAR(10) DEFAULT 'en',

    -- Status
                            is_active BOOLEAN DEFAULT true,

    -- Timestamps
                            created_at TIMESTAMPTZ DEFAULT NOW(),
                            updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_businesses_phone ON businesses(phone_number);
CREATE INDEX idx_businesses_whatsapp_id ON businesses(whatsapp_number_id);

-- =============================================
-- PRODUCTS TABLE
-- =============================================

CREATE TABLE products (
                          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                          business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

                          name VARCHAR(255) NOT NULL,
                          description TEXT,
                          category VARCHAR(100),

    -- Pricing
                          base_price DECIMAL(10,2) NOT NULL,
                          minimum_price DECIMAL(10,2) NOT NULL,

    -- Media
                          images JSONB DEFAULT '[]',

    -- AI Search (pgvector)
                          image_embedding vector(768),
                          text_embedding vector(768),

    -- Inventory
                          stock_quantity INTEGER DEFAULT 0,
                          low_stock_threshold INTEGER DEFAULT 5,

    -- Status
                          is_active BOOLEAN DEFAULT true,

    -- Timestamps
                          created_at TIMESTAMPTZ DEFAULT NOW(),
                          updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_business ON products(business_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_active ON products(is_active);

-- Vector similarity index
CREATE INDEX idx_products_image_embedding ON products
    USING ivfflat (image_embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE INDEX idx_products_text_embedding ON products
    USING ivfflat (text_embedding vector_cosine_ops)
    WITH (lists = 100);

-- =============================================
-- PRODUCT VARIANTS TABLE
-- =============================================

CREATE TABLE product_variants (
                                  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

                                  name VARCHAR(100) NOT NULL,
                                  sku VARCHAR(100),

                                  price_adjustment DECIMAL(10,2) DEFAULT 0,
                                  stock_quantity INTEGER DEFAULT 0,
                                  low_stock_threshold INTEGER DEFAULT 5,

                                  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_variants_product ON product_variants(product_id);

-- =============================================
-- CUSTOMERS TABLE
-- =============================================

CREATE TABLE customers (
                           id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                           business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

                           phone_number VARCHAR(20) NOT NULL,
                           name VARCHAR(255),

    -- Preferences
                           preferred_language VARCHAR(10) DEFAULT 'en',

    -- Stats
                           total_orders INTEGER DEFAULT 0,
                           total_spent DECIMAL(10,2) DEFAULT 0,
                           last_order_at TIMESTAMPTZ,

    -- Consent
                           opted_in_at TIMESTAMPTZ,
                           opted_out_at TIMESTAMPTZ,

                           created_at TIMESTAMPTZ DEFAULT NOW(),

                           UNIQUE(business_id, phone_number)
);

CREATE INDEX idx_customers_business_phone ON customers(business_id, phone_number);
CREATE INDEX idx_customers_phone ON customers(phone_number);

-- =============================================
-- CONVERSATIONS TABLE
-- =============================================

CREATE TABLE conversations (
                               id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                               business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
                               customer_phone VARCHAR(20) NOT NULL,

    -- State machine
                               current_state VARCHAR(50) DEFAULT 'BROWSING',

    -- Session data
                               cart_items JSONB DEFAULT '[]',
                               context_memory JSONB DEFAULT '{}',
                               delivery_address JSONB,

    -- Metadata
                               last_message_at TIMESTAMPTZ DEFAULT NOW(),
                               handoff_to_human BOOLEAN DEFAULT false,

                               created_at TIMESTAMPTZ DEFAULT NOW(),

                               UNIQUE(business_id, customer_phone)
);

CREATE INDEX idx_conversations_business_phone ON conversations(business_id, customer_phone);
CREATE INDEX idx_conversations_state ON conversations(current_state);

-- =============================================
-- MESSAGES TABLE (Evidence Vault)
-- =============================================

CREATE TABLE messages (
                          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                          business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
                          conversation_id UUID REFERENCES conversations(id),

                          direction VARCHAR(10) NOT NULL,
                          content TEXT NOT NULL,
                          content_hash VARCHAR(64) NOT NULL,

                          whatsapp_message_id VARCHAR(100),

                          created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_messages_hash ON messages(content_hash);

-- =============================================
-- ORDERS TABLE
-- =============================================

CREATE TABLE orders (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
                        customer_id UUID REFERENCES customers(id),

                        order_number VARCHAR(50) UNIQUE NOT NULL,

    -- Amounts
                        subtotal DECIMAL(10,2) NOT NULL,
                        delivery_fee DECIMAL(10,2) DEFAULT 0,
                        total_amount DECIMAL(10,2) NOT NULL,

    -- Items (denormalized)
                        items JSONB NOT NULL,

    -- Delivery
                        delivery_address JSONB,
                        delivery_zone VARCHAR(100),

    -- Payment
                        payment_method VARCHAR(50),
                        payment_status VARCHAR(20) DEFAULT 'PENDING',
                        mpesa_receipt VARCHAR(100),

    -- Status
                        status VARCHAR(20) DEFAULT 'PENDING',

    -- Timestamps
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        paid_at TIMESTAMPTZ,
                        completed_at TIMESTAMPTZ
);

CREATE INDEX idx_orders_business ON orders(business_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);

-- =============================================
-- TRANSACTIONS TABLE (Ledger)
-- =============================================

CREATE TABLE transactions (
                              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                              business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
                              order_id UUID REFERENCES orders(id),

                              type VARCHAR(20) NOT NULL,

    -- Financial breakdown
                              gross_amount DECIMAL(10,2) NOT NULL,
                              vat_amount DECIMAL(10,2) DEFAULT 0,
                              platform_fee DECIMAL(10,2) DEFAULT 0,
                              net_amount DECIMAL(10,2) NOT NULL,

    -- Payment details
                              mpesa_receipt VARCHAR(100) UNIQUE,
                              payment_phone VARCHAR(20),

                              status VARCHAR(20) DEFAULT 'PENDING',

    -- Timestamps
                              created_at TIMESTAMPTZ DEFAULT NOW(),
                              processed_at TIMESTAMPTZ
);

CREATE INDEX idx_transactions_business ON transactions(business_id);
CREATE INDEX idx_transactions_order ON transactions(order_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_mpesa ON transactions(mpesa_receipt);

-- =============================================
-- AUDIT LOGS TABLE
-- =============================================

CREATE TABLE audit_logs (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            business_id UUID REFERENCES businesses(id),
                            user_id UUID,

                            action VARCHAR(100) NOT NULL,
                            resource_type VARCHAR(50),
                            resource_id UUID,

                            changes JSONB,
                            ip_address VARCHAR(45),

                            created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_business ON audit_logs(business_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- =============================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY tenant_isolation_products ON products
  USING (business_id = current_setting('app.current_business_id', true)::uuid);

CREATE POLICY tenant_isolation_customers ON customers
  USING (business_id = current_setting('app.current_business_id', true)::uuid);

CREATE POLICY tenant_isolation_conversations ON conversations
  USING (business_id = current_setting('app.current_business_id', true)::uuid);

CREATE POLICY tenant_isolation_orders ON orders
  USING (business_id = current_setting('app.current_business_id', true)::uuid);

CREATE POLICY tenant_isolation_transactions ON transactions
  USING (business_id = current_setting('app.current_business_id', true)::uuid);

-- =============================================
-- FUNCTIONS
-- =============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON businesses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
business_prefix VARCHAR(3);
  order_count INTEGER;
BEGIN
  -- Get business name prefix
SELECT UPPER(LEFT(name, 3)) INTO business_prefix
FROM businesses WHERE id = NEW.business_id;

-- Get order count for today
SELECT COUNT(*) INTO order_count
FROM orders
WHERE business_id = NEW.business_id
  AND DATE(created_at) = CURRENT_DATE;

-- Generate order number: BUS-20260126-001
NEW.order_number = business_prefix || '-' ||
                     TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
                     LPAD((order_count + 1)::TEXT, 3, '0');

RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_order_number_trigger
    BEFORE INSERT ON orders
    FOR EACH ROW
    WHEN (NEW.order_number IS NULL)
    EXECUTE FUNCTION generate_order_number();

-- =============================================
-- VIEWS
-- =============================================

-- Business dashboard stats
CREATE OR REPLACE VIEW business_dashboard_stats AS
SELECT
    b.id as business_id,
    b.name as business_name,
    COUNT(DISTINCT o.id) as total_orders,
    COUNT(DISTINCT c.id) as total_customers,
    COALESCE(SUM(CASE WHEN o.payment_status = 'PAID' THEN o.total_amount ELSE 0 END), 0) as total_revenue,
    COUNT(CASE WHEN o.status = 'PENDING' THEN 1 END) as pending_orders,
    COUNT(DISTINCT p.id) as total_products
FROM businesses b
         LEFT JOIN orders o ON o.business_id = b.id
         LEFT JOIN customers c ON c.business_id = b.id
         LEFT JOIN products p ON p.business_id = b.id
GROUP BY b.id, b.name;

-- =============================================
-- INITIAL DATA
-- =============================================

-- Insert default system data if needed
-- (Add any default categories, settings, etc.)

COMMIT;