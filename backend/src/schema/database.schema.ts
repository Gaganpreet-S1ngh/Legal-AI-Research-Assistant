import { DatabaseManager } from "../config/database.config";
import { logger } from "../utils/logger";

const DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || "1024");

export const setupSchema = async () => {
  await DatabaseManager.instance.withTransaction(async (client) => {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");

    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        title      TEXT        NOT NULL,
        source     TEXT,
        metadata   JSONB       DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chunks (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        chunk_index INTEGER     NOT NULL,
        content     TEXT        NOT NULL,
        token_count INTEGER,
        embedding   VECTOR(${DIMENSIONS}),
        metadata    JSONB       DEFAULT '{}',
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // IVFFlat index — fast approximate nearest-neighbor search
    // Cosine distance is best for normalized embeddings
    await client.query(`
      CREATE INDEX IF NOT EXISTS chunks_embedding_idx
      ON chunks
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS chunks_document_id_idx
      ON chunks (document_id)
    `);

    logger.info("Schema setup completed!");
  });
};