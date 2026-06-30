import mammoth from "mammoth";
import { logger } from "../logger";
import pLimit from "p-limit";
import { ResultType } from "../../types/result.type";

export interface MammothOpts {
    convertConcurrency: number;
    convertTimeout: number;
    convertMaxRetries: number;
    convertRetryBaseMs: number;
}

export interface MammothMessage {
    type: string;
    message: string;
}

export interface MammothResult {
    value: string;
    messages: MammothMessage[];
}

export type DocxSource =
    | { buffer: Buffer }
    | { path: string };

export type ConvertFormat = "html" | "markdown";

export class MammothService {
    private convertConcurrency: number;
    private convertTimeout: number;
    private convertMaxRetries: number;
    private convertRetryBaseMs: number;
    private static _instance: MammothService;
    private limiter: ReturnType<typeof pLimit>;
    private initialized = false;

    constructor(opts: MammothOpts) {
        this.convertConcurrency = opts.convertConcurrency;
        this.convertTimeout = opts.convertTimeout;
        this.convertMaxRetries = opts.convertMaxRetries;
        this.convertRetryBaseMs = opts.convertRetryBaseMs;
        this.limiter = pLimit(this.convertConcurrency);
    }

    static getInstance(opts?: MammothOpts): MammothService {
        if (!this._instance) {
            if (!opts) throw new Error("MammothService must be initialized with options on first call.");
            MammothService._instance = new MammothService(opts);
        }
        return MammothService._instance;
    }

    // Mammoth is stateless (no workers/handles to spin up), but we keep an
    // initialize/disconnect lifecycle for symmetry with the other services
    // and to register shutdown hooks.
    async initialize(): Promise<void> {
        if (this.initialized) return;

        logger.info(`Initializing MammothService with concurrency ${this.convertConcurrency}…`);
        this.initialized = true;

        process.once("SIGTERM", () => this.gracefulShutdown());
        process.once("SIGINT", () => this.gracefulShutdown());

        logger.info("MammothService initialized.");
    }

    async disconnect(): Promise<void> {
        logger.info("Shutting down MammothService…");
        this.initialized = false;
        logger.info("MammothService shut down.");
    }

    async convert(
        source: DocxSource,
    ): Promise<MammothResult> {
        this.assertInitialized();
        return this.limiter(() => this.convertWithRetry(source));
    }

    async convertBatch(
        sources: Array<DocxSource>,
        opts: { format?: ConvertFormat; failFast?: boolean } = {}
    ): Promise<Array<MammothResult | null>> {
        this.assertInitialized();

        const { format = "html", failFast = false } = opts;

        const tasks = sources.map((source) =>
            this.limiter(async () => {
                try {
                    return await this.convertWithRetry(source);
                } catch (err) {
                    if (failFast) throw err;
                    logger.error("Mammoth conversion failed for document, returning null.", err);
                    return null;
                }
            })
        );

        return Promise.all(tasks);
    }

    // Convenience helper for when you just want plain text (e.g. for search
    // indexing) rather than HTML/Markdown.
    async extractRawText(source: DocxSource): Promise<ResultType> {
        this.assertInitialized();
        const mammothResult = await this.limiter(() => this.runWithTimeout(() => mammoth.extractRawText(source as any)));

        return {
            text: mammothResult.value,
            metadata: {
                "messages": mammothResult.messages
            }
        }
    }

    private async convertWithRetry(
        source: DocxSource,
    ): Promise<MammothResult> {
        let attempt = 0;

        while (true) {
            try {
                return await this.convertWithTimeout(source);
            } catch (err) {
                attempt++;
                if (attempt > this.convertMaxRetries) {
                    logger.error(`Mammoth conversion failed after ${attempt} attempt(s).`, err);
                    throw err;
                }

                const backoffMs = this.convertRetryBaseMs * 2 ** (attempt - 1);
                logger.warn(`Mammoth conversion attempt ${attempt} failed; retrying in ${backoffMs} ms…`, err);
                await this.delay(backoffMs);
            }
        }
    }

    private convertWithTimeout(
        source: DocxSource
    ): Promise<MammothResult> {
        return this.runWithTimeout(() =>
            mammoth.convertToHtml(source as any)
        );
    }

    private runWithTimeout(task: () => Promise<MammothResult>): Promise<MammothResult> {
        return new Promise<MammothResult>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error(`Mammoth conversion timed out after ${this.convertTimeout} ms`)),
                this.convertTimeout
            );

            task()
                .then((result) => {
                    clearTimeout(timer);
                    resolve({
                        value: result.value,
                        messages: result.messages as MammothMessage[]
                    });
                })
                .catch((err: unknown) => {
                    clearTimeout(timer);
                    reject(err);
                });
        });
    }

    private assertInitialized(): void {
        if (!this.initialized) {
            throw new Error("MammothService is not initialized. Call initialize() first.");
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private async gracefulShutdown(): Promise<void> {
        logger.info("Received shutdown signal, terminating MammothService…");
        await this.disconnect();
        process.exit(0);
    }
}