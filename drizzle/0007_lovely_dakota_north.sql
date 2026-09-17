CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_code" varchar(30) NOT NULL,
	"first_name" varchar(120) NOT NULL,
	"last_name" varchar(120) NOT NULL,
	"job_title" varchar(120) NOT NULL,
	"hired_at" date NOT NULL,
	"base_salary_cents" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_employee_code_unique" UNIQUE("employee_code")
);
--> statement-breakpoint
CREATE TABLE "payroll_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"paid_at" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employees_is_active_idx" ON "employees" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "employees_last_name_idx" ON "employees" USING btree ("last_name");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_payments_employee_period_active_idx" ON "payroll_payments" USING btree ("employee_id","period") WHERE "payroll_payments"."voided_at" is null;--> statement-breakpoint
CREATE INDEX "payroll_payments_period_idx" ON "payroll_payments" USING btree ("period");--> statement-breakpoint
CREATE INDEX "payroll_payments_employee_id_idx" ON "payroll_payments" USING btree ("employee_id");