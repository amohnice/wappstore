ALTER TABLE "businesses" ALTER COLUMN "subscription_status" SET DEFAULT 'PENDING_PAYMENT';--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "subscription_paid_at" timestamp;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "prefers_cod" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "payment_integration_enabled" boolean DEFAULT false;