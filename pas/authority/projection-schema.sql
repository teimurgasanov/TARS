-- Isolated downstream fixture store. This is NOT a TARS ledger or writer.
CREATE TABLE Projection (
  canonicalPaymentId TEXT PRIMARY KEY NOT NULL CHECK (length(canonicalPaymentId) > 0),
  amountMinorUnits INTEGER NOT NULL CHECK (amountMinorUnits > 0),
  currency TEXT NOT NULL,
  paymentDate TEXT NOT NULL
) STRICT;

CREATE TABLE ObservationProjection (
  canonicalPaymentId TEXT NOT NULL REFERENCES Projection(canonicalPaymentId),
  observationJson TEXT NOT NULL,
  PRIMARY KEY (canonicalPaymentId, observationJson)
) STRICT;

CREATE TABLE EffectInbox (
  effectId TEXT PRIMARY KEY NOT NULL CHECK (length(effectId) > 0),
  kind TEXT NOT NULL,
  payloadJson TEXT NOT NULL CHECK (json_valid(payloadJson)),
  payloadDigest TEXT NOT NULL
) STRICT;

CREATE TRIGGER projection_no_update BEFORE UPDATE ON Projection BEGIN SELECT RAISE(ABORT, 'immutable projection'); END;
CREATE TRIGGER projection_no_delete BEFORE DELETE ON Projection BEGIN SELECT RAISE(ABORT, 'immutable projection'); END;
CREATE TRIGGER inbox_no_update BEFORE UPDATE ON EffectInbox BEGIN SELECT RAISE(ABORT, 'immutable inbox'); END;
CREATE TRIGGER inbox_no_delete BEFORE DELETE ON EffectInbox BEGIN SELECT RAISE(ABORT, 'immutable inbox'); END;
