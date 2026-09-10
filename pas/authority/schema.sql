CREATE TABLE PaymentSlot (
  slotId TEXT PRIMARY KEY NOT NULL CHECK (length(slotId) > 0)
) STRICT;

CREATE TABLE ConfirmedPayment (
  canonicalPaymentId TEXT PRIMARY KEY NOT NULL CHECK (length(canonicalPaymentId) > 0),
  slotId TEXT NOT NULL UNIQUE REFERENCES PaymentSlot(slotId),
  status TEXT NOT NULL CHECK (status = 'LIVE'),
  amountMinorUnits INTEGER NOT NULL CHECK (amountMinorUnits > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  paymentDate TEXT NOT NULL,
  firstCommandJson TEXT NOT NULL CHECK (json_valid(firstCommandJson))
) STRICT;

CREATE TABLE IdentityAlias (
  kind TEXT NOT NULL CHECK (kind IN ('receiptCaseId', 'exactHash', 'observation', 'visualHash')),
  aliasValue TEXT NOT NULL CHECK (length(aliasValue) > 0),
  canonicalPaymentId TEXT NOT NULL REFERENCES ConfirmedPayment(canonicalPaymentId),
  PRIMARY KEY (kind, aliasValue)
) STRICT;

CREATE TABLE CommandLog (
  commandId TEXT PRIMARY KEY NOT NULL CHECK (length(commandId) > 0),
  commandJson TEXT NOT NULL CHECK (json_valid(commandJson)),
  status TEXT NOT NULL CHECK (status IN ('CONFIRMED', 'ALREADY_CONFIRMED', 'CONFLICT', 'REJECTED')),
  canonicalPaymentId TEXT REFERENCES ConfirmedPayment(canonicalPaymentId),
  resultJson TEXT NOT NULL CHECK (json_valid(resultJson)),
  CHECK (status NOT IN ('CONFIRMED', 'ALREADY_CONFIRMED') OR canonicalPaymentId IS NOT NULL),
  CHECK (json_extract(resultJson, '$.status') IS status),
  CHECK (json_extract(resultJson, '$.canonicalPaymentId') IS canonicalPaymentId)
) STRICT;

CREATE TABLE CommandEvidence (
  commandId TEXT PRIMARY KEY NOT NULL REFERENCES CommandLog(commandId),
  canonicalPaymentId TEXT NOT NULL REFERENCES ConfirmedPayment(canonicalPaymentId),
  evidenceJson TEXT NOT NULL CHECK (json_valid(evidenceJson))
) STRICT;

CREATE TABLE FinancialEffect (
  effectId TEXT PRIMARY KEY NOT NULL CHECK (length(effectId) > 0),
  canonicalPaymentId TEXT NOT NULL REFERENCES ConfirmedPayment(canonicalPaymentId),
  kind TEXT NOT NULL CHECK (kind IN ('WRITE_CONFIRMED_PROJECTION', 'ASSOCIATE_OBSERVATION')),
  dedupeKey TEXT NOT NULL,
  payloadJson TEXT NOT NULL CHECK (json_valid(payloadJson)),
  payloadDigest TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING', 'COMPLETED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  UNIQUE (canonicalPaymentId, kind, dedupeKey)
) STRICT;

CREATE TABLE CommandEffect (
  commandId TEXT NOT NULL REFERENCES CommandLog(commandId),
  effectId TEXT NOT NULL REFERENCES FinancialEffect(effectId),
  PRIMARY KEY (commandId, effectId)
) STRICT;

CREATE TRIGGER slot_no_update BEFORE UPDATE ON PaymentSlot BEGIN SELECT RAISE(ABORT, 'immutable slot'); END;
CREATE TRIGGER slot_no_delete BEFORE DELETE ON PaymentSlot BEGIN SELECT RAISE(ABORT, 'immutable slot'); END;
CREATE TRIGGER payment_no_update BEFORE UPDATE ON ConfirmedPayment BEGIN SELECT RAISE(ABORT, 'immutable confirmation'); END;
CREATE TRIGGER payment_no_delete BEFORE DELETE ON ConfirmedPayment BEGIN SELECT RAISE(ABORT, 'immutable confirmation'); END;
CREATE TRIGGER alias_no_update BEFORE UPDATE ON IdentityAlias BEGIN SELECT RAISE(ABORT, 'immutable alias'); END;
CREATE TRIGGER alias_no_delete BEFORE DELETE ON IdentityAlias BEGIN SELECT RAISE(ABORT, 'immutable alias'); END;
CREATE TRIGGER command_no_update BEFORE UPDATE ON CommandLog BEGIN SELECT RAISE(ABORT, 'immutable command'); END;
CREATE TRIGGER command_no_delete BEFORE DELETE ON CommandLog BEGIN SELECT RAISE(ABORT, 'immutable command'); END;
CREATE TRIGGER evidence_no_update BEFORE UPDATE ON CommandEvidence BEGIN SELECT RAISE(ABORT, 'immutable evidence'); END;
CREATE TRIGGER evidence_no_delete BEFORE DELETE ON CommandEvidence BEGIN SELECT RAISE(ABORT, 'immutable evidence'); END;
CREATE TRIGGER command_effect_no_update BEFORE UPDATE ON CommandEffect BEGIN SELECT RAISE(ABORT, 'immutable effect link'); END;
CREATE TRIGGER command_effect_no_delete BEFORE DELETE ON CommandEffect BEGIN SELECT RAISE(ABORT, 'immutable effect link'); END;
CREATE TRIGGER effect_no_delete BEFORE DELETE ON FinancialEffect BEGIN SELECT RAISE(ABORT, 'durable effect'); END;
CREATE TRIGGER effect_identity_immutable BEFORE UPDATE ON FinancialEffect
WHEN NEW.effectId IS NOT OLD.effectId OR NEW.canonicalPaymentId IS NOT OLD.canonicalPaymentId
  OR NEW.kind IS NOT OLD.kind OR NEW.dedupeKey IS NOT OLD.dedupeKey
  OR NEW.payloadJson IS NOT OLD.payloadJson OR NEW.payloadDigest IS NOT OLD.payloadDigest
  OR (OLD.state = 'COMPLETED' AND NEW.state != 'COMPLETED') OR NEW.attempts < OLD.attempts
BEGIN SELECT RAISE(ABORT, 'immutable effect identity/monotonic completion'); END;
