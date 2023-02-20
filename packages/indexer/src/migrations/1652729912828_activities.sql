-- Up Migration

CREATE TABLE activities (
    id bigserial NOT NULL,
	hash text,
    type text NOT NULL,
    contract BYTEA,
    collection_id text,
    token_id NUMERIC(78),
    from_address BYTEA,
    to_address BYTEA,
    price NUMERIC(78),
    amount NUMERIC(78),
    metadata JSONB,
    block_hash BYTEA,
    event_timestamp INT,
    created_at timestamp with time zone DEFAULT NOW(),
    CONSTRAINT activities_pk PRIMARY KEY (id)
);

CREATE INDEX activities_collection_id_event_timestamp_type_index
    ON activities (collection_id, event_timestamp DESC NULLS LAST, type);

CREATE INDEX activities_contract_token_id_event_timestamp_type_index
    ON activities (contract, token_id, event_timestamp DESC NULLS LAST, type);

CREATE INDEX activities_collection_id_created_at_type_index
    ON activities (collection_id, created_at DESC NULLS LAST, type);

CREATE INDEX activities_contract_token_id_created_at_type_index
    ON activities (contract, token_id, created_at DESC NULLS LAST, type);

CREATE INDEX activities_block_hash_index
    ON activities (block_hash);

CREATE UNIQUE INDEX activities_hash_unique_index
    ON activities (hash);

CREATE INDEX activities_event_timestamp_index
  ON activities (event_timestamp DESC);

-- Down Migration

DROP TABLE activities;
