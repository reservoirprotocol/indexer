export class Orders {
  public static buildCriteriaQuery(
    tableName: string,
    tokenSetIdColumnName: string,
    includeMetadata: boolean,
    tokenSetSchemaHashColumnName?: string
  ): string {
    let criteriaQuery: string;

    let tokenSetFilter = `token_sets.id = ${tableName}.${tokenSetIdColumnName}`;

    if (tokenSetSchemaHashColumnName) {
      tokenSetFilter += ` AND token_sets.schema_hash = ${tableName}.${tokenSetSchemaHashColumnName}`;
    }

    if (includeMetadata) {
      criteriaQuery = `
          CASE
            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'token:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'token',
                  'data', json_build_object(
                    'token', json_build_object(
                      'tokenId', tokens.token_id::TEXT,
                      'name', tokens.name,
                      'image', tokens.image
                    ),
                    'collection', json_build_object(
                      'id', collections.id,
                      'name', collections.name,
                      'image', (collections.metadata ->> 'imageUrl')::TEXT
                    )
                  )
                )
              FROM tokens
              LEFT JOIN collections
                ON tokens.collection_id = collections.id
              WHERE tokens.contract = decode(substring(split_part(${tableName}.${tokenSetIdColumnName}, ':', 2) from 3), 'hex')
                AND tokens.token_id = (split_part(${tableName}.${tokenSetIdColumnName}, ':', 3)::NUMERIC(78, 0)))

            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'contract:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collection', json_build_object(
                      'id', collections.id,
                      'name', collections.name,
                      'image', (collections.metadata ->> 'imageUrl')::TEXT
                    )
                  )
                )
              FROM collections
              WHERE collections.id = substring(${tableName}.${tokenSetIdColumnName} from 10))

            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'range:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collection', json_build_object(
                      'id', collections.id,
                      'name', collections.name,
                      'image', (collections.metadata ->> 'imageUrl')::TEXT
                    )
                  )
                )
              FROM collections
              WHERE collections.id = substring(${tableName}.${tokenSetIdColumnName} from 7))

            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'list:%' THEN
              (SELECT
                CASE
                  WHEN token_sets.collection_id IS NULL AND token_sets.attribute_id IS NULL THEN
                    (SELECT
                      json_build_object(
                        'kind', 'custom',
                        'data', json_build_object(
                          'tokenSetId', token_sets.id
                        )
                      )
                    )
                  WHEN token_sets.attribute_id IS NULL THEN
                    (SELECT
                      json_build_object(
                        'kind', 'collection',
                        'data', json_build_object(
                          'collection', json_build_object(
                            'id', collections.id,
                            'name', collections.name,
                            'image', (collections.metadata ->> 'imageUrl')::TEXT
                          )
                        )
                      )
                    FROM collections
                    WHERE token_sets.collection_id = collections.id)
                  ELSE
                    (SELECT
                      json_build_object(
                        'kind', 'attribute',
                        'data', json_build_object(
                          'collection', json_build_object(
                            'id', collections.id,
                            'name', collections.name,
                            'image', (collections.metadata ->> 'imageUrl')::TEXT
                          ),
                          'attribute', json_build_object('key', attribute_keys.key, 'value', attributes.value)
                        )
                      )
                    FROM attributes
                    JOIN attribute_keys
                    ON attributes.attribute_key_id = attribute_keys.id
                    JOIN collections
                    ON attribute_keys.collection_id = collections.id
                    WHERE token_sets.attribute_id = attributes.id)
                END  
              FROM token_sets
              WHERE ${tokenSetFilter}
              LIMIT 1)

            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'dynamic:collection-non-flagged:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collection', json_build_object(
                      'id', collections.id,
                      'name', collections.name,
                      'image', (collections.metadata ->> 'imageUrl')::TEXT
                    )
                  )
                )
              FROM collections
              WHERE collections.id = substring(${tableName}.${tokenSetIdColumnName} from 32))

            ELSE NULL
          END
      `;
    } else {
      criteriaQuery = `
          CASE
            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'token:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'token',
                  'data', json_build_object(
                    'token', json_build_object(
                      'tokenId', (split_part(${tableName}.${tokenSetIdColumnName}, ':', 3))
                    )
                  )
                )
              )
                
            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'contract:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collection', json_build_object(
                      'id', substring(${tableName}.${tokenSetIdColumnName} from 10)
                    )
                  )
                )
              )
              
            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'range:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collection', json_build_object(
                      'id', substring(${tableName}.${tokenSetIdColumnName} from 7)
                    )
                  )
                )
              )
              
            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'list:%' THEN
              (SELECT
                CASE
                  WHEN token_sets.collection_id IS NULL AND token_sets.attribute_id IS NULL THEN
                    (SELECT
                      json_build_object(
                        'kind', 'custom',
                        'data', json_build_object(
                          'tokenSetId', token_sets.id
                        )
                      )
                    )
                  WHEN token_sets.attribute_id IS NULL THEN
                    (SELECT
                      json_build_object(
                        'kind', 'collection',
                        'data', json_build_object(
                          'collection', json_build_object(
                            'id', token_sets.collection_id
                          )
                        )
                      )
                    )  
                  ELSE
                    (SELECT
                      json_build_object(
                        'kind', 'attribute',
                        'data', json_build_object(
                          'collection', json_build_object(
                            'id', (token_sets.schema -> 'data' ->> 'collection')::TEXT
                          ),
                          'attribute', json_build_object(
                            'key', (token_sets.schema -> 'data' -> 'attributes' -> 0 ->> 'key')::TEXT,
                            'value',(token_sets.schema -> 'data' -> 'attributes' -> 0 ->> 'value')::TEXT
                          )
                        )
                      )
                    )
                END  
              FROM token_sets
              WHERE ${tokenSetFilter}
              LIMIT 1)

            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'dynamic:collection-non-flagged:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collection', json_build_object(
                      'id', substring(${tableName}.${tokenSetIdColumnName} from 32)
                    )
                  )
                )
              )

            ELSE NULL
          END
      `;
    }

    return criteriaQuery;
  }

  public static buildCriteriaQueryV2(
    tableName: string,
    tokenSetIdColumnName: string,
    includeMetadata: boolean,
    tokenSetSchemaHashColumnName?: string
  ): string {
    let criteriaQuery: string;

    let tokenSetFilter = `token_sets.id = ${tableName}.${tokenSetIdColumnName}`;

    if (tokenSetSchemaHashColumnName) {
      tokenSetFilter += ` AND token_sets.schema_hash = ${tableName}.${tokenSetSchemaHashColumnName}`;
    }

    if (includeMetadata) {
      criteriaQuery = `
          CASE
            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'token:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'token',
                  'data', json_build_object(
                    'token', json_build_object(
                      'tokenId', tokens.token_id::TEXT,
                      'name', tokens.name,
                      'image', tokens.image,
                      'image_version', tokens.image_version,
                      'image_mime_type', (tokens.metadata ->> 'image_mime_type')::TEXT
                    ),
                    'collection', json_build_object(
                      'id', collections.id,
                      'name', collections.name,
                      'image', (collections.metadata ->> 'imageUrl')::TEXT
                    )
                  )
                )
              FROM tokens
              LEFT JOIN collections
                ON tokens.collection_id = collections.id
              WHERE tokens.contract = decode(substring(split_part(${tableName}.${tokenSetIdColumnName}, ':', 2) from 3), 'hex')
                AND tokens.token_id = (split_part(${tableName}.${tokenSetIdColumnName}, ':', 3)::NUMERIC(78, 0)))

            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'contract:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collection', json_build_object(
                      'id', collections.id,
                      'name', collections.name,
                      'image', (collections.metadata ->> 'imageUrl')::TEXT
                    )
                  )
                )
              FROM collections
              WHERE collections.id = substring(${tableName}.${tokenSetIdColumnName} from 10))

            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'range:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collection', json_build_object(
                      'id', collections.id,
                      'name', collections.name,
                      'image', (collections.metadata ->> 'imageUrl')::TEXT
                    )
                  )
                )
              FROM collections
              WHERE collections.id = substring(${tableName}.${tokenSetIdColumnName} from 7))

            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'list:%' THEN
              (SELECT
                CASE
                  WHEN token_sets.collection_id IS NULL AND token_sets.attribute_id IS NULL THEN
                    (SELECT
                      json_build_object(
                        'kind', 'custom',
                        'data', json_build_object(
                          'tokenSetId', token_sets.id
                        )
                      )
                    )
                  WHEN token_sets.attribute_id IS NULL THEN
                    (SELECT
                      json_build_object(
                        'kind', 'collection',
                        'data', json_build_object(
                          'collection', json_build_object(
                            'id', collections.id,
                            'name', collections.name,
                            'image', (collections.metadata ->> 'imageUrl')::TEXT
                          )
                        )
                      )
                    FROM collections
                    WHERE token_sets.collection_id = collections.id)
                  ELSE
                    (SELECT
                      json_build_object(
                        'kind', 'attribute',
                        'data', json_build_object(
                          'collection', json_build_object(
                            'id', collections.id,
                            'name', collections.name,
                            'image', (collections.metadata ->> 'imageUrl')::TEXT
                          ),
                          'attribute', json_build_object('key', attribute_keys.key, 'value', attributes.value)
                        )
                      )
                    FROM attributes
                    JOIN attribute_keys
                    ON attributes.attribute_key_id = attribute_keys.id
                    JOIN collections
                    ON attribute_keys.collection_id = collections.id
                    WHERE token_sets.attribute_id = attributes.id)
                END  
              FROM token_sets
              WHERE ${tokenSetFilter}
              LIMIT 1)

            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'dynamic:collection-non-flagged:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collection', json_build_object(
                      'id', collections.id,
                      'name', collections.name,
                      'image', (collections.metadata ->> 'imageUrl')::TEXT
                    )
                  )
                )
              FROM collections
              WHERE collections.id = substring(${tableName}.${tokenSetIdColumnName} from 32))

            ELSE NULL
          END
      `;
    } else {
      criteriaQuery = `
          CASE
            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'token:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'token',
                  'data', json_build_object(
                    'token', json_build_object(
                      'tokenId', (split_part(${tableName}.${tokenSetIdColumnName}, ':', 3))
                    )
                  )
                )
              )
                
            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'contract:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collection', json_build_object(
                      'id', substring(${tableName}.${tokenSetIdColumnName} from 10)
                    )
                  )
                )
              )
              
            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'range:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collection', json_build_object(
                      'id', substring(${tableName}.${tokenSetIdColumnName} from 7)
                    )
                  )
                )
              )
              
            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'list:%' THEN
              (SELECT
                CASE
                  WHEN token_sets.collection_id IS NULL AND token_sets.attribute_id IS NULL THEN
                    (SELECT
                      json_build_object(
                        'kind', 'custom',
                        'data', json_build_object(
                          'tokenSetId', token_sets.id
                        )
                      )
                    )
                  WHEN token_sets.attribute_id IS NULL THEN
                    (SELECT
                      json_build_object(
                        'kind', 'collection',
                        'data', json_build_object(
                          'collection', json_build_object(
                            'id', token_sets.collection_id
                          )
                        )
                      )
                    )  
                  ELSE
                    (SELECT
                      json_build_object(
                        'kind', 'attribute',
                        'data', json_build_object(
                          'collection', json_build_object(
                            'id', (token_sets.schema -> 'data' ->> 'collection')::TEXT
                          ),
                          'attribute', json_build_object(
                            'key', (token_sets.schema -> 'data' -> 'attributes' -> 0 ->> 'key')::TEXT,
                            'value',(token_sets.schema -> 'data' -> 'attributes' -> 0 ->> 'value')::TEXT
                          )
                        )
                      )
                    )
                END  
              FROM token_sets
              WHERE ${tokenSetFilter}
              LIMIT 1)

            WHEN ${tableName}.${tokenSetIdColumnName} LIKE 'dynamic:collection-non-flagged:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collection', json_build_object(
                      'id', substring(${tableName}.${tokenSetIdColumnName} from 32)
                    )
                  )
                )
              )

            ELSE NULL
          END
      `;
    }

    return criteriaQuery;
  }
}
