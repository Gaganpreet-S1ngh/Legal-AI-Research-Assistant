import { createScheduler, createWorker, ImageLike, Scheduler, Worker } from "tesseract.js";

import pLimit from "p-limit";
import { logger } from "../logger";

export interface OCROpts {
    ocrConcurrency: number;
    ocrTimeout: number;
    orcMaxRetries: number;
    ocrRetryBaseMs: number;
    defaultLang: string;
}

export interface OCRResult {
    text: string;
    confidence: number;
    lang: string;
}

export class OCRService {
    private ocrConcurrency: number;
    private ocrTimeout: number;
    private orcMaxRetries: number;
    private ocrRetryBaseMs: number;
    private defaultLang: string;
    private static _instance: OCRService;
    private scheduler: Scheduler;
    private limiter: ReturnType<typeof pLimit>;
    private workers: Worker[] = [];
    private initialized = false;


    constructor(opts: OCROpts) {
        this.defaultLang = opts.defaultLang;
        this.ocrConcurrency = opts.ocrConcurrency;
        this.ocrRetryBaseMs = opts.ocrRetryBaseMs;
        this.orcMaxRetries = opts.orcMaxRetries;
        this.ocrTimeout = opts.ocrTimeout;
        this.scheduler = createScheduler();
        this.limiter = pLimit(this.ocrConcurrency);
    }

    static getInstance(opts?: OCROpts): OCRService {
        if (!this._instance) {
            if (!opts) throw new Error("OCRService must be initialized with options on first call.");
            OCRService._instance = new OCRService(opts);
        }
        return OCRService._instance;
    }


    async initialize(lang?: string): Promise<void> {
        if (this.initialized) return;

        const targetLang = lang ?? this.defaultLang;
        logger.info(`Initializing OCRService with ${this.ocrConcurrency} worker(s) for lang "${targetLang}"…`);

        const workerPromises = Array.from({ length: this.ocrConcurrency }, async () => {
            const worker = await createWorker(targetLang);
            this.scheduler.addWorker(worker);
            this.workers.push(worker);
        });

        await Promise.all(workerPromises);
        this.initialized = true;

        // Graceful-shutdown hooks
        process.once("SIGTERM", () => this.gracefulShutdown());
        process.once("SIGINT", () => this.gracefulShutdown());

        logger.info("OCRService initialized.");
    }

    async disconnect(): Promise<void> {
        logger.info("Shutting down OCRService…");
        await this.scheduler.terminate();
        this.workers = [];
        this.initialized = false;
        logger.info("OCRService shut down.");
    }


    async recognize(image: ImageLike, lang?: string): Promise<OCRResult> {
        this.assertInitialized();

        // Calling plimit to limit concurrency so that less CPU and memory is used for this CPU intensive process
        const result = this.limiter(() => this.recogniseWithRetry(image, lang ?? this.defaultLang))
        console.log(result);

        return result;
    }

    async recogniseBatch(
        images: Array<ImageLike>,
        opts: { lang?: string; failFast?: boolean } = {}
    ): Promise<Array<OCRResult | null>> {
        this.assertInitialized();

        const { lang = this.defaultLang, failFast = false } = opts;

        const tasks = images.map((img) =>
            this.limiter(async () => {
                try {
                    return await this.recogniseWithRetry(img, lang);
                } catch (err) {
                    if (failFast) throw err;
                    logger.error("OCR failed for image, returning null.", err);
                    return null;
                }
            })
        );

        return Promise.all(tasks);
    }


    private async recogniseWithRetry(
        image: ImageLike,
        lang: string
    ): Promise<OCRResult> {
        let attempt = 0;

        while (true) {
            try {
                return await this.recogniseWithTimeout(image, lang);
            } catch (err) {
                attempt++;
                if (attempt > this.orcMaxRetries) {
                    logger.error(`OCR failed after ${attempt} attempt(s).`, err);
                    throw err;
                }

                const backoffMs = this.ocrRetryBaseMs * 2 ** (attempt - 1);
                logger.warn(`OCR attempt ${attempt} failed; retrying in ${backoffMs} ms…`, err);
                await this.delay(backoffMs);
            }
        }
    }

    private recogniseWithTimeout(
        image: ImageLike,
        lang: string
    ): Promise<OCRResult> {

        // Not an async function because we need our resolve reject for timeout
        return new Promise<OCRResult>((resolve, reject) => {
            // set timeout when its done the following function fires
            const timer = setTimeout(
                () => reject(new Error(`OCR timed out after ${this.ocrTimeout} ms`)),
                this.ocrTimeout
            );

            /*
                const result = await Promise.race([
                this.scheduler.addJob("recognize", image),
                timeoutPromise,
                ]);
            */

            // Cannot use await here hence we use then to fetch and do things on results
            this.scheduler.addJob("recognize", image).then((result) => {
                console.log(result);
                // Clear timeout
                clearTimeout(timer);
                // resolve the promise
                resolve({
                    text: result.data.text,
                    confidence: result.data.confidence,
                    lang
                })
            }).catch((err: unknown) => {
                clearTimeout(timer);
                reject(err);
            })

        });
    }


    private assertInitialized(): void {
        if (!this.initialized) {
            throw new Error("OCRService is not initialized. Call initialize() first.");
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private async gracefulShutdown(): Promise<void> {
        logger.info("Received shutdown signal, terminating OCR scheduler…");
        await this.disconnect();
        process.exit(0);
    }



}