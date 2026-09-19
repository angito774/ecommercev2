CREATE TYPE "public"."tipo_transaccion" AS ENUM('ingreso', 'salida');--> statement-breakpoint
CREATE TABLE "inventory_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_number" integer GENERATED ALWAYS AS IDENTITY (sequence name "inventory_documents_doc_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"transaccion_id" varchar(40) NOT NULL,
	"doc_date" date NOT NULL,
	"reference" varchar(120),
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"stock_after" integer NOT NULL,
	CONSTRAINT "stock_movements_quantity_positive" CHECK ("stock_movements"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "transacciones" (
	"idtrans" varchar(40) PRIMARY KEY NOT NULL,
	"nomtrans" varchar(60) NOT NULL,
	"tipotrans" "tipo_transaccion" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_documents" ADD CONSTRAINT "inventory_documents_transaccion_id_transacciones_idtrans_fk" FOREIGN KEY ("transaccion_id") REFERENCES "public"."transacciones"("idtrans") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_documents" ADD CONSTRAINT "inventory_documents_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_document_id_inventory_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."inventory_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_documents_doc_number_idx" ON "inventory_documents" USING btree ("doc_number");--> statement-breakpoint
CREATE INDEX "inventory_documents_doc_date_idx" ON "inventory_documents" USING btree ("doc_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "inventory_documents_transaccion_id_idx" ON "inventory_documents" USING btree ("transaccion_id");--> statement-breakpoint
CREATE INDEX "stock_movements_document_id_idx" ON "stock_movements" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "stock_movements_product_id_idx" ON "stock_movements" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movements_document_product_idx" ON "stock_movements" USING btree ("document_id","product_id");