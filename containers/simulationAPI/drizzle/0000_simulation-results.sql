CREATE TABLE "simulation_results" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "simulation_results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source" text NOT NULL,
	"hero_hand" text[] NOT NULL,
	"villain_hand" text[] NOT NULL,
	"board" text[] NOT NULL,
	"simulations" integer NOT NULL,
	"hero_equity" double precision NOT NULL,
	"high" jsonb NOT NULL,
	"low" jsonb NOT NULL,
	"scoop" jsonb NOT NULL,
	"no_scoop" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
