import { PDFParse } from "pdf-parse";

import pLimit from "p-limit";
import { logger } from "../logger";
import { ResultType } from "../../types/result.type";

export interface PdfParseOpts {
    parseConcurrency: number;
    parseTimeout: number;
    parseMaxRetries: number;
    parseRetryBaseMs: number;
}

export interface PdfTextResult {
    text: string;
    numPages: number;
}

export type PdfSource =
    | { data: Buffer | Uint8Array }
    | { url: string | URL };

export class PdfParseService {
    private parseConcurrency: number;
    private parseTimeout: number;
    private parseMaxRetries: number;
    private parseRetryBaseMs: number;
    private static _instance: PdfParseService;
    private limiter: ReturnType<typeof pLimit>;
    private initialized = false;

    constructor(opts: PdfParseOpts) {
        this.parseConcurrency = opts.parseConcurrency;
        this.parseTimeout = opts.parseTimeout;
        this.parseMaxRetries = opts.parseMaxRetries;
        this.parseRetryBaseMs = opts.parseRetryBaseMs;
        this.limiter = pLimit(this.parseConcurrency);
    }

    static getInstance(opts?: PdfParseOpts): PdfParseService {
        if (!this._instance) {
            if (!opts) throw new Error("PdfParseService must be initialized with options on first call.");
            PdfParseService._instance = new PdfParseService(opts);
        }
        return PdfParseService._instance;
    }

    // pdf-parse has no long-lived workers to spin up (each PDFParse instance is
    // created/destroyed per document), but we keep an initialize/disconnect
    // lifecycle for symmetry with other services and to register shutdown hooks.
    async initialize(): Promise<void> {
        if (this.initialized) return;

        logger.info(`Initializing PdfParseService with concurrency ${this.parseConcurrency}…`);
        this.initialized = true;

        process.once("SIGTERM", () => this.gracefulShutdown());
        process.once("SIGINT", () => this.gracefulShutdown());

        logger.info("PdfParseService initialized.");
    }

    async disconnect(): Promise<void> {
        logger.info("Shutting down PdfParseService…");
        this.initialized = false;
        logger.info("PdfParseService shut down.");
    }

    async extractText(source: PdfSource, pages?: number[]): Promise<ResultType> {
        this.assertInitialized();
        const pdfResult = await this.limiter(() => this.parseWithRetry(source, pages));

        return {
            text: pdfResult.text,
            metadata: {
                "num_pages": pdfResult.numPages
            }
        }
    }

    async extractTextBatch(
        sources: Array<PdfSource>,
        opts: { pages?: number[]; failFast?: boolean } = {}
    ): Promise<Array<PdfTextResult | null>> {
        this.assertInitialized();

        const { pages, failFast = false } = opts;

        const tasks = sources.map((source) =>
            this.limiter(async () => {
                try {
                    return await this.parseWithRetry(source, pages);
                } catch (err) {
                    if (failFast) throw err;
                    logger.error("PDF parse failed for document, returning null.", err);
                    return null;
                }
            })
        );

        return Promise.all(tasks);
    }

    private async parseWithRetry(
        source: PdfSource,
        pages?: number[]
    ): Promise<PdfTextResult> {
        let attempt = 0;

        while (true) {
            try {
                return await this.parseWithTimeout(source, pages);
            } catch (err) {
                attempt++;
                if (attempt > this.parseMaxRetries) {
                    logger.error(`PDF parse failed after ${attempt} attempt(s).`, err);
                    throw err;
                }

                const backoffMs = this.parseRetryBaseMs * 2 ** (attempt - 1);
                logger.warn(`PDF parse attempt ${attempt} failed; retrying in ${backoffMs} ms…`, err);
                await this.delay(backoffMs);
            }
        }
    }

    private parseWithTimeout(
        source: PdfSource,
        pages?: number[]
    ): Promise<PdfTextResult> {
        return new Promise<PdfTextResult>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error(`PDF parse timed out after ${this.parseTimeout} ms`)),
                this.parseTimeout
            );

            const parser = new PDFParse(source as any);

            parser
                .getText(pages ? { partial: pages } : undefined)
                .then((result) => {
                    clearTimeout(timer);
                    resolve({
                        text: result.text,
                        numPages: result.pages?.length ?? 0
                    });
                })
                .catch((err: unknown) => {
                    clearTimeout(timer);
                    reject(err);
                })
                .finally(() => {
                    // Always release underlying pdf.js / worker resources,
                    // even on timeout/failure, to avoid leaking handles.
                    parser.destroy().catch((err: unknown) => {
                        logger.warn("Failed to destroy PDFParse instance.", err);
                    });
                });
        });
    }

    private assertInitialized(): void {
        if (!this.initialized) {
            throw new Error("PdfParseService is not initialized. Call initialize() first.");
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private async gracefulShutdown(): Promise<void> {
        logger.info("Received shutdown signal, terminating PdfParseService…");
        await this.disconnect();
        process.exit(0);
    }
}