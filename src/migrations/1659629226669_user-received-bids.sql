-- Up Migration

CREATE TABLE user_received_bids (
    id bigserial NOT NULL,
    address BYTEA NOT NULL,
    contract BYTEA NOT NULL,
    token_set_id TEXT NOT NULL,
	order_id TEXT NOT NULL,
	order_source_id_int INT,
	order_created_at TIMESTAMPTZ NOT NULL,
    maker BYTEA NOT NULL,
    price NUMERIC(78) NOT NULL,
    value NUMERIC(78) NOT NULL,
    quantity NUMERIC(78, 0) DEFAULT 1 NOT NULL,
    valid_between TSTZRANGE NOT NULL,
    metadata JSONB,
    clean_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT user_received_bids_pk PRIMARY KEY (id)
);

CREATE UNIQUE INDEX user_received_bids_address_order_id_index
    ON user_received_bids (address, order_id);

CREATE INDEX user_received_bids_address_id_index
    ON user_received_bids (address, id);

CREATE INDEX user_received_bids_clean_at_index
    ON user_received_bids (clean_at);

-- Down Migration

DROP TABLE user_received_bids;
