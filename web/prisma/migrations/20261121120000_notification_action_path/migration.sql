ALTER TABLE "notifications"
ADD COLUMN "action_path" VARCHAR(500);

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_action_path_internal_check"
CHECK (
  "action_path" IS NULL OR (
    "action_path" ~ '^/(borrower|investor|admin)(/|\?|$)'
    AND "action_path" NOT LIKE '//%'
    AND "action_path" !~ '[[:cntrl:]]'
  )
);
