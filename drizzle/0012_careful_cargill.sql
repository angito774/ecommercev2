CREATE TYPE "public"."purchase_receipt_type" AS ENUM('factura', 'boleta', 'recibo_honorarios', 'otro');--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "receipt_type" "purchase_receipt_type";--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "supplier_ruc" varchar(11);--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "supplier_name" varchar(160);--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "receipt_series" varchar(4);--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "receipt_number" varchar(20);--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "igv_cents" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_receipt_all_or_nothing" CHECK (("expenses"."receipt_type" is null) = ("expenses"."supplier_ruc" is null)
          and ("expenses"."receipt_type" is null) = ("expenses"."supplier_name" is null));--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_ruc_format" CHECK ("expenses"."supplier_ruc" ~ '^[0-9]{11}$');--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_receipt_series_number_pair" CHECK (("expenses"."receipt_series" is null) = ("expenses"."receipt_number" is null)
          and ("expenses"."receipt_type" is not null or "expenses"."receipt_series" is null));--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_igv_within_amount" CHECK ("expenses"."igv_cents" is null
          or ("expenses"."receipt_type" is not null
              and "expenses"."igv_cents" >= 0
              and "expenses"."igv_cents" < "expenses"."amount_cents"));