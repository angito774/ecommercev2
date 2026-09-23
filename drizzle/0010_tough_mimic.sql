CREATE TYPE "public"."document_series_key" AS ENUM('boleta', 'factura', 'nota_credito_boleta', 'nota_credito_factura', 'nota_debito_boleta', 'nota_debito_factura');--> statement-breakpoint
CREATE TYPE "public"."electronic_document_kind" AS ENUM('boleta', 'factura', 'nota_credito', 'nota_debito', 'comunicacion_baja');--> statement-breakpoint
CREATE TYPE "public"."electronic_document_status" AS ENUM('pending', 'issued', 'failed', 'voided');--> statement-breakpoint
CREATE TYPE "public"."buyer_document_type" AS ENUM('dni', 'ruc');--> statement-breakpoint
CREATE TABLE "document_series" (
	"key" "document_series_key" PRIMARY KEY NOT NULL,
	"series" varchar(4) NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_series_series_unique" UNIQUE("series"),
	CONSTRAINT "document_series_last_number_positive" CHECK ("document_series"."last_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "electronic_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"related_document_id" uuid,
	"kind" "electronic_document_kind" NOT NULL,
	"reason_code" varchar(4),
	"series" varchar(4),
	"number" integer,
	"amount_cents" integer,
	"base_cents" integer,
	"igv_cents" integer,
	"status" "electronic_document_status" DEFAULT 'pending' NOT NULL,
	"issued_at" timestamp with time zone,
	"pdf_url" text,
	"xml_url" text,
	"cdr_url" text,
	"provider_response" jsonb,
	"last_error" text,
	"stripe_refund_id" varchar(255),
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "electronic_documents_attempt_count_positive" CHECK ("electronic_documents"."attempt_count" >= 0),
	CONSTRAINT "electronic_documents_void_has_no_amount" CHECK (("electronic_documents"."kind" = 'comunicacion_baja') = ("electronic_documents"."amount_cents" is null)),
	CONSTRAINT "electronic_documents_void_has_no_series" CHECK (("electronic_documents"."kind" = 'comunicacion_baja') = ("electronic_documents"."series" is null)),
	CONSTRAINT "electronic_documents_series_number_pair" CHECK (("electronic_documents"."series" is null) = ("electronic_documents"."number" is null)),
	CONSTRAINT "electronic_documents_original_has_no_parent" CHECK (("electronic_documents"."kind" in ('boleta', 'factura')) = ("electronic_documents"."related_document_id" is null)),
	CONSTRAINT "electronic_documents_amount_breakdown" CHECK (("electronic_documents"."amount_cents" is null and "electronic_documents"."base_cents" is null and "electronic_documents"."igv_cents" is null)
          or ("electronic_documents"."amount_cents" > 0
              and "electronic_documents"."base_cents" > 0
              and "electronic_documents"."igv_cents" >= 0
              and "electronic_documents"."base_cents" + "electronic_documents"."igv_cents" = "electronic_documents"."amount_cents")),
	CONSTRAINT "electronic_documents_issued_at_matches_status" CHECK (("electronic_documents"."status" = 'issued') = ("electronic_documents"."issued_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "buyer_document_type" "buyer_document_type";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "buyer_document_number" varchar(11);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "buyer_legal_name" varchar(160);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_related_document_id_electronic_documents_id_fk" FOREIGN KEY ("related_document_id") REFERENCES "public"."electronic_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "electronic_documents_order_id_idx" ON "electronic_documents" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "electronic_documents_one_original_per_order_idx" ON "electronic_documents" USING btree ("order_id") WHERE "electronic_documents"."kind" in ('boleta', 'factura') and "electronic_documents"."status" <> 'voided';--> statement-breakpoint
CREATE UNIQUE INDEX "electronic_documents_series_number_idx" ON "electronic_documents" USING btree ("series","number") WHERE "electronic_documents"."series" is not null;--> statement-breakpoint
CREATE INDEX "electronic_documents_unissued_idx" ON "electronic_documents" USING btree ("created_at") WHERE "electronic_documents"."status" in ('pending', 'failed');--> statement-breakpoint
CREATE INDEX "electronic_documents_issued_at_idx" ON "electronic_documents" USING btree ("issued_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_document_pair" CHECK (("orders"."buyer_document_type" is null) = ("orders"."buyer_document_number" is null));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_document_length" CHECK ("orders"."buyer_document_number" is null
          or ("orders"."buyer_document_type" = 'dni' and char_length("orders"."buyer_document_number") = 8)
          or ("orders"."buyer_document_type" = 'ruc' and char_length("orders"."buyer_document_number") = 11));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_legal_name_requires_ruc" CHECK ("orders"."buyer_legal_name" is null or "orders"."buyer_document_type" = 'ruc');--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_refunded_amount_within_total" CHECK ("orders"."refunded_amount_cents" >= 0
          and "orders"."refunded_amount_cents" <= "orders"."amount_total_cents");