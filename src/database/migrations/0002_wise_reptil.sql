ALTER TABLE "conversations" ADD COLUMN "latitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "longitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "latitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "longitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "discount_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "discount_ends_at" timestamp;