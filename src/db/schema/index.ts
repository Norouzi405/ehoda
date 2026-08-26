/**
 * Barrel export for the full Drizzle schema. Import from here in the app
 * code and in drizzle.config.ts, never import individual schema files
 * directly, so the DB client type stays consistent.
 *
 * See docs/database-schema.md for the full ERD and PostgreSQL migration
 * mapping (portability rule 3.2).
 */
export * from './users'
export * from './professionals'
export * from './content'
export * from './questions'
export * from './responses'
export * from './tools'
export * from './system'
