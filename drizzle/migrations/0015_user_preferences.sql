ALTER TABLE "user_accounts" ADD COLUMN "preferences" jsonb DEFAULT '{}'::jsonb NOT NULL;
