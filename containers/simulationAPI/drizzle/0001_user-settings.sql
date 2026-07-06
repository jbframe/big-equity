CREATE TABLE "user_settings" (
	"user_sub" text PRIMARY KEY NOT NULL,
	"game_type" text DEFAULT 'big-o' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
