CREATE INDEX "security_events_auth_rate_limit_idx"
ON "security_events"("event_type", "source_reference", "created_at");
