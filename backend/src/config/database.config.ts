import { Pool, PoolConfig, PoolClient } from "pg";
import { logger } from "../utils/logger";

export class DatabaseManager {
  private static _instance: DatabaseManager;
  private pool: Pool | null = null;
  private isConnected: boolean = false;
  private retryCount: number = 0;

  static get instance() {
    if (!this._instance) {
      this._instance = new DatabaseManager();
    }
    return this._instance;
  }

  public async connect(config: PoolConfig): Promise<void> {
    if (this.isConnected) {
      logger.info("Database is already connected");
      return;
    }
    try {
      await this.connectWithRetry(config);
      this.pool!.on("error", (error) => {
        logger.error("Unexpected error on idle PostgreSQL client:", error);
        this.isConnected = false;
        this.handleDisconnection(config);
      });
      process.on("SIGINT", this.gracefulShutdown.bind(this));
      process.on("SIGTERM", this.gracefulShutdown.bind(this));
      this.isConnected = true;
      logger.info("Successfully connected to PostgreSQL");
    } catch (error) {
      logger.error("Failed to connect to PostgreSQL after all retry attempts", error);
      throw error;
    }
  }

  private async connectWithRetry(config: PoolConfig): Promise<void> {
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.pool = new Pool({
          max: 10,
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 45000,
          ...config,
        });
        // Verify the connection is actually reachable
        const client = await this.pool.connect();
        client.release();
        this.retryCount = 0;
        logger.info("PostgreSQL pool created successfully");
        return;
      } catch (error) {
        logger.warn(`Connection attempt ${attempt}/${maxAttempts} failed:`, error);
        if (this.pool) {
          await this.pool.end();
          this.pool = null;
        }
        if (attempt === maxAttempts) {
          throw new Error(`Failed to connect to PostgreSQL after ${maxAttempts} attempts`);
        }
        await this.delay(5000);
      }
    }
  }

  private async handleDisconnection(config: PoolConfig): Promise<void> {
    if (this.retryCount < 5) {
      this.retryCount++;
      logger.info(`Attempting to reconnect (${this.retryCount}/5)`);
      try {
        await this.delay(5000);
        await this.connectWithRetry(config);
      } catch (error) {
        logger.error("Reconnection failed:", error);
      }
    }
  }

  public getPool(): Pool {
    if (!this.pool || !this.isConnected) {
      throw new Error("Database is not connected. Call connect() first.");
    }
    return this.pool;
  }

  public async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const pool = this.getPool();
    const result = await pool.query(text, params);
    return result.rows;
  }

  public async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected || !this.pool) {
      return;
    }
    try {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
      logger.info("Successfully disconnected from PostgreSQL");
    } catch (error) {
      logger.error("Error disconnecting from PostgreSQL:", error);
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async gracefulShutdown(): Promise<void> {
    logger.info("Received shutdown signal, closing PostgreSQL connection...");
    await this.disconnect();
    process.exit(0);
  }
}