-- Domain 7 model governance, immutable ML history, and official risk-assessment integrity.
BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "model_versions"
        GROUP BY "model_name", "version"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Domain 7 migration stopped: duplicate model_name/version pairs exist.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "risk_assessments"
        WHERE "default_probability" < 0 OR "default_probability" > 1
    ) THEN
        RAISE EXCEPTION 'Domain 7 migration stopped: a default probability is outside the inclusive range 0 to 1.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "risk_assessments"
        WHERE "assessment_status" = 'CURRENT'
        GROUP BY "application_version_id"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Domain 7 migration stopped: an application version has multiple current risk assessments.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "risk_assessments" ra
        JOIN "prediction_records" pr ON pr."id" = ra."prediction_record_id"
        JOIN "feature_snapshots" fs ON fs."id" = pr."feature_snapshot_id"
        JOIN "application_versions" av ON av."id" = ra."application_version_id"
        WHERE pr."prediction_type" <> 'OFFICIAL'
           OR fs."application_version_id" <> ra."application_version_id"
           OR av."application_id" <> ra."application_id"
    ) THEN
        RAISE EXCEPTION 'Domain 7 migration stopped: a risk assessment does not reference an OFFICIAL prediction for the same application version/application.';
    END IF;

    IF EXISTS (
        WITH latest_activation AS (
            SELECT model_version_id, action,
                   ROW_NUMBER() OVER (PARTITION BY model_version_id ORDER BY created_at DESC, id::TEXT DESC) AS rn
            FROM "model_activation_history"
            WHERE action IN ('ACTIVATED', 'DEACTIVATED', 'ROLLED_BACK')
        )
        SELECT 1 FROM latest_activation la
        JOIN "model_versions" mv ON mv.id = la.model_version_id
        WHERE la.rn = 1 AND la.action = 'ACTIVATED' AND mv.status <> 'APPROVED'
    ) THEN
        RAISE EXCEPTION 'Domain 7 migration stopped: an active model version is not APPROVED.';
    END IF;

    IF EXISTS (
        WITH latest_activation AS (
            SELECT model_version_id, action,
                   ROW_NUMBER() OVER (PARTITION BY model_version_id ORDER BY created_at DESC, id::TEXT DESC) AS rn
            FROM "model_activation_history"
            WHERE action IN ('ACTIVATED', 'DEACTIVATED', 'ROLLED_BACK')
        )
        SELECT mv.model_name FROM latest_activation la
        JOIN "model_versions" mv ON mv.id = la.model_version_id
        WHERE la.rn = 1 AND la.action = 'ACTIVATED'
        GROUP BY mv.model_name HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Domain 7 migration stopped: multiple versions of a model name appear active in activation history.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "model_activation_history"
        WHERE action IN ('ACTIVATED', 'DEACTIVATED', 'ROLLED_BACK')
        GROUP BY model_version_id, created_at
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Domain 7 migration stopped: tied activation timestamps make existing active state ambiguous.';
    END IF;
END $$;

ALTER TABLE "model_versions"
    ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT FALSE;

WITH latest_activation AS (
    SELECT model_version_id, action,
           ROW_NUMBER() OVER (PARTITION BY model_version_id ORDER BY created_at DESC, id::TEXT DESC) AS rn
    FROM "model_activation_history"
    WHERE action IN ('ACTIVATED', 'DEACTIVATED', 'ROLLED_BACK')
)
UPDATE "model_versions" mv
SET "is_active" = TRUE
FROM latest_activation la
WHERE la.model_version_id = mv.id AND la.rn = 1 AND la.action = 'ACTIVATED';

-- A model name/version pair identifies one registered artifact.
DROP INDEX "model_versions_model_name_version_idx";
CREATE UNIQUE INDEX "model_versions_model_name_version_key"
    ON "model_versions" ("model_name", "version");

CREATE UNIQUE INDEX "risk_assessments_one_current_per_application_version_key"
    ON "risk_assessments" ("application_version_id")
    WHERE "assessment_status" = 'CURRENT';

CREATE UNIQUE INDEX "model_versions_one_active_per_model_name_key"
    ON "model_versions" ("model_name")
    WHERE "is_active";

ALTER TABLE "model_versions"
    ADD CONSTRAINT "model_versions_active_requires_approved"
    CHECK (NOT "is_active" OR "status" = 'APPROVED');

ALTER TABLE "risk_assessments"
    ADD CONSTRAINT "risk_assessments_default_probability_range"
    CHECK ("default_probability" >= 0 AND "default_probability" <= 1);

CREATE FUNCTION "prevent_ml_history_mutation"()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'ML and model activation history is immutable; append a new record instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "model_activation_history_immutable"
    BEFORE UPDATE OR DELETE ON "model_activation_history"
    FOR EACH ROW EXECUTE FUNCTION "prevent_ml_history_mutation"();

CREATE TRIGGER "feature_snapshots_immutable"
    BEFORE UPDATE OR DELETE ON "feature_snapshots"
    FOR EACH ROW EXECUTE FUNCTION "prevent_ml_history_mutation"();

CREATE TRIGGER "prediction_records_immutable"
    BEFORE UPDATE OR DELETE ON "prediction_records"
    FOR EACH ROW EXECUTE FUNCTION "prevent_ml_history_mutation"();

CREATE FUNCTION "protect_model_version_identity"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Model-version records are retained for historical predictions.';
    END IF;
    IF ROW(NEW."model_name", NEW."version", NEW."artifact_location", NEW."artifact_checksum", NEW."feature_schema_version", NEW."registered_at")
       IS DISTINCT FROM
       ROW(OLD."model_name", OLD."version", OLD."artifact_location", OLD."artifact_checksum", OLD."feature_schema_version", OLD."registered_at") THEN
        RAISE EXCEPTION 'Model artifact identity is immutable; register a new model version instead.';
    END IF;
    IF NEW."is_active" IS DISTINCT FROM OLD."is_active"
       AND current_setting('nexus.model_activation_event', TRUE) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Change model activation state by adding a ModelActivationHistory event.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "model_versions_protect_identity"
    BEFORE UPDATE OR DELETE ON "model_versions"
    FOR EACH ROW EXECUTE FUNCTION "protect_model_version_identity"();

CREATE FUNCTION "validate_model_activation_event"()
RETURNS TRIGGER AS $$
DECLARE
    v_model_name VARCHAR(100);
    v_status "model_version_status";
    v_is_active BOOLEAN;
BEGIN
    SELECT "model_name" INTO v_model_name
    FROM "model_versions" WHERE "id" = NEW."model_version_id";
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Model activation event references an unknown model version.';
    END IF;

    PERFORM 1 FROM "model_versions"
    WHERE "model_name" = v_model_name
    ORDER BY "id" FOR UPDATE;
    SELECT "status", "is_active" INTO v_status, v_is_active
    FROM "model_versions" WHERE "id" = NEW."model_version_id" FOR UPDATE;

    IF NEW."action" = 'ACTIVATED' THEN
        PERFORM 1 FROM "model_versions" WHERE "model_name" = v_model_name ORDER BY "id" FOR UPDATE;
        IF v_status <> 'APPROVED' THEN
            RAISE EXCEPTION 'Only APPROVED model versions may be activated.';
        END IF;
        IF v_is_active THEN
            RAISE EXCEPTION 'Model version is already active.';
        END IF;
        IF EXISTS (SELECT 1 FROM "model_versions" WHERE "model_name" = v_model_name AND "is_active") THEN
            RAISE EXCEPTION 'Deactivate the current version with a history event before activating another version of this model.';
        END IF;
    ELSIF NEW."action" IN ('DEACTIVATED', 'ROLLED_BACK') AND NOT v_is_active THEN
        RAISE EXCEPTION 'DEACTIVATED and ROLLED_BACK events require the referenced version to be active.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "apply_model_activation_event"()
RETURNS TRIGGER AS $$
DECLARE
    v_previous_setting TEXT;
BEGIN
    IF NEW."action" = 'APPROVED' THEN
        UPDATE "model_versions" SET "status" = 'APPROVED' WHERE "id" = NEW."model_version_id";
    ELSIF NEW."action" IN ('ACTIVATED', 'DEACTIVATED', 'ROLLED_BACK') THEN
        v_previous_setting := current_setting('nexus.model_activation_event', TRUE);
        PERFORM set_config('nexus.model_activation_event', 'on', TRUE);
        UPDATE "model_versions"
        SET "is_active" = (NEW."action" = 'ACTIVATED')
        WHERE "id" = NEW."model_version_id";
        PERFORM set_config('nexus.model_activation_event', COALESCE(v_previous_setting, ''), TRUE);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "model_activation_history_validate"
    BEFORE INSERT ON "model_activation_history"
    FOR EACH ROW EXECUTE FUNCTION "validate_model_activation_event"();

CREATE TRIGGER "model_activation_history_apply_state"
    AFTER INSERT ON "model_activation_history"
    FOR EACH ROW EXECUTE FUNCTION "apply_model_activation_event"();

CREATE FUNCTION "enforce_risk_assessment_rules"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Risk-assessment history is retained; supersede it rather than deleting it.';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF ROW(NEW."application_id", NEW."application_version_id", NEW."prediction_record_id", NEW."default_probability", NEW."risk_grade", NEW."created_at")
           IS DISTINCT FROM
           ROW(OLD."application_id", OLD."application_version_id", OLD."prediction_record_id", OLD."default_probability", OLD."risk_grade", OLD."created_at")
           OR OLD."assessment_status" <> 'CURRENT' OR NEW."assessment_status" <> 'SUPERSEDED' THEN
            RAISE EXCEPTION 'A risk assessment may only transition from CURRENT to SUPERSEDED; its contents are immutable.';
        END IF;
    END IF;

    IF NEW."default_probability" < 0 OR NEW."default_probability" > 1 THEN
        RAISE EXCEPTION 'Default probability must be between 0 and 1.';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM "prediction_records" pr
        JOIN "feature_snapshots" fs ON fs."id" = pr."feature_snapshot_id"
        JOIN "application_versions" av ON av."id" = NEW."application_version_id"
        WHERE pr."id" = NEW."prediction_record_id"
          AND pr."prediction_type" = 'OFFICIAL'
          AND fs."application_version_id" = NEW."application_version_id"
          AND av."application_id" = NEW."application_id"
    ) THEN
        RAISE EXCEPTION 'Risk assessments must reference an OFFICIAL prediction for the same application version and application.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "risk_assessments_enforce_official_prediction"
    BEFORE INSERT OR UPDATE OR DELETE ON "risk_assessments"
    FOR EACH ROW EXECUTE FUNCTION "enforce_risk_assessment_rules"();

COMMIT;
