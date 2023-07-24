-- Up Migration

CREATE TABLE "ft_approvals" (
  "token" BYTEA NOT NULL,
  "owner" BYTEA NOT NULL,
  "spender" BYTEA NOT NULL,
  "value" NUMERIC NOT NULL
);

ALTER TABLE "ft_approvals"
  ADD CONSTRAINT "ft_approvals_pk"
  PRIMARY KEY ("token", "owner", "spender");

-- Down Migration

DROP TABLE "ft_approvals";