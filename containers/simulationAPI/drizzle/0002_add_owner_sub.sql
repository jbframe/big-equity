ALTER TABLE "simulation_results" ADD COLUMN "owner_sub" text;--> statement-breakpoint
-- Rows created before ownership existed have no owner. Tag them with a
-- sentinel no real FusionAuth sub can collide with: they stay in the table
-- but are invisible to every user, since all reads are scoped by owner_sub.
UPDATE "simulation_results" SET "owner_sub" = 'legacy:pre-ownership' WHERE "owner_sub" IS NULL;--> statement-breakpoint
ALTER TABLE "simulation_results" ALTER COLUMN "owner_sub" SET NOT NULL;
