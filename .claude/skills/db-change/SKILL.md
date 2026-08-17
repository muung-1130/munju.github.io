---
name: db-change
description: Designs, reviews, or implements a DAI RUN database schema or migration. Use for tables, columns, indexes, constraints, PostGIS geometry, migrations, data ownership, or ERD changes.
argument-hint: "[service] [database change]"
---

# DAI RUN Database Change

Requested change:

$ARGUMENTS

## Step 1: Ownership

Determine which service owns the data.

Reject or redesign the change when:

- one service attempts to own another service's table
- a cross-service foreign key is introduced
- Elasticsearch or Redis becomes the only source of truth
- binary media is placed directly in PostgreSQL without justification

## Step 2: Schema design

Document:

- schema name
- table name
- column name and type
- nullable rule
- primary key
- unique constraints
- foreign keys within the same service only
- indexes
- check constraints
- created and updated timestamps
- soft-delete requirement
- retention requirement

## Step 3: PostGIS review

For geometry data:

- use SRID 4326 unless another coordinate system is justified
- choose Point, LineString, or MultiLineString intentionally
- use geography for meter-based radius queries when appropriate
- add GIST indexes
- validate coordinates
- preserve point ordering for routes

## Step 4: Migration safety

- Use the repository's existing migration tool.
- Do not edit an already-applied migration.
- Prefer additive changes.
- For a non-null column, plan default/backfill/constraint steps.
- For destructive changes, stop and request explicit approval.
- Describe rollback or recovery steps.

## Step 5: Related systems

Check whether the change affects:

- API DTOs
- Kafka event schemas
- Redis cache keys
- Elasticsearch mappings
- MinIO metadata
- batch jobs
- AI Tool Calling response schemas

## Completion report

Provide:

1. Ownership decision
2. Schema or migration
3. Index rationale
4. Compatibility impact
5. Backfill plan
6. Rollback plan
7. Tests required
