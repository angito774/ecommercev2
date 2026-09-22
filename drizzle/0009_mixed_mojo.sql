ALTER TABLE "products" ADD COLUMN "average_cost_cents" integer;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "unit_cost_cents" integer;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_average_cost_cents_positive" CHECK ("products"."average_cost_cents" is null or "products"."average_cost_cents" > 0);--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_unit_cost_cents_positive" CHECK ("stock_movements"."unit_cost_cents" is null or "stock_movements"."unit_cost_cents" > 0);