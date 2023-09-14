-- Up Migration

CREATE TABLE user_activities (
    id bigserial NOT NULL,
	hash text,
    type text NOT NULL,
    contract BYTEA,
    collection_id text,
    token_id NUMERIC(78),
    address BYTEA,
    from_address BYTEA,
    to_address BYTEA,
    price NUMERIC(78),
    amount NUMERIC(78),
    metadata JSONB,
    block_hash BYTEA,
    event_timestamp INT,
    created_at timestamp with time zone DEFAULT NOW(),
    CONSTRAINT user_activities_pk PRIMARY KEY (id)
);

CREATE INDEX user_activities_address_event_timestamp_type_index
    ON user_activities (address, event_timestamp DESC NULLS LAST, type);

CREATE INDEX user_activities_address_created_at_type_index
    ON user_activities (address, created_at DESC NULLS LAST, type);

CREATE UNIQUE INDEX user_activities_hash_address_unique_index
    ON user_activities (hash, address);

CREATE INDEX user_activities_contract_token_id_collection_id_index
    ON user_activities (contract, token_id, collection_id);

CREATE INDEX user_activities_block_hash_index
    ON user_activities (block_hash);

-- Down Migration

DROP TABLE user_activities;
