-- Completed investor payouts are financial history. Correct them with
-- compensating ledger and payout records instead of editing or deleting them.
CREATE FUNCTION "protect_completed_investor_payout_mutation"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD."status" = 'COMPLETED' THEN
            RAISE EXCEPTION 'Completed investor payouts are immutable; record a compensating financial transaction.';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD."status" = 'COMPLETED' THEN
        RAISE EXCEPTION 'Completed investor payouts are immutable; record a compensating financial transaction.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "investor_payouts_immutable_after_completion"
    BEFORE UPDATE OR DELETE ON "investor_payouts"
    FOR EACH ROW EXECUTE FUNCTION "protect_completed_investor_payout_mutation"();
