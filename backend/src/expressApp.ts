import { Ollama } from "ollama";
import { HandleErrorWithLogger } from "./utils/errors";
import { httpLogger } from "./utils/logger";
import express, { NextFunction, Request, Response } from "express";
import { AIService } from "./services/ai.service";
import { AIController } from "./api/controllers/ai.controller";
import { AIRoutes } from "./api/routes/ai.routes";
import { DatabaseManager } from "./config/database.config";
import { setupSchema } from "./schema/database.schema";
import { OCRService } from "./utils/parsers/ocr.service";
import { PdfParseService } from "./utils/parsers/pdf.service";
import { MammothService } from "./utils/parsers/docx.service";


export const expressApp = async () => {
  const app = express();

  // Database connection

  // await DatabaseManager.instance.connect({
  //   host: "localhost",
  //   port: 5432,
  //   user: "default_user",
  //   password: "default_password",
  //   database: "vectordb"
  // })

  // setupSchema();


  // OCR Connection 

  const ocrService = OCRService.getInstance({
    ocrConcurrency: 4,
    ocrTimeout: 15_000,
    orcMaxRetries: 3,
    ocrRetryBaseMs: 500,
    defaultLang: "eng"
  })

  await ocrService.initialize();

  // PDF Parse ServicE
  const pdfParseService = PdfParseService.getInstance({
    parseConcurrency: 4,        // how many PDFs to parse in parallel
    parseTimeout: 30_000,       // ms before a single parse is aborted
    parseMaxRetries: 2,         // retries on failure/timeout
    parseRetryBaseMs: 500       // base for exponential backoff
  })

  await pdfParseService.initialize()

  // Mammoth Service

  const mammothService = MammothService.getInstance({
    convertConcurrency: 4,
    convertTimeout: 15_000,
    convertMaxRetries: 2,
    convertRetryBaseMs: 500
  });

  await mammothService.initialize()

  app.use(express.json());
  app.use(httpLogger);

  app.get("/api", (req: Request, res: Response, next: NextFunction) => {
    res.status(200).json("I am healthy!");
  });

  const ollamaClient = new Ollama({ host: 'http://127.0.0.1:11434' })
  const aiService = new AIService(ollamaClient, ocrService, mammothService, pdfParseService);
  const aiController = new AIController(aiService);
  const aIRoutes = new AIRoutes(aiController);

  app.use("/api/ai", aIRoutes.router)


  app.use(HandleErrorWithLogger);

  return app;
};
