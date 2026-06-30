import { NextFunction, Request, Response } from "express";
import { AIService } from "../../services/ai.service";
import { OCRService, OCRResult } from "../../utils/parsers/ocr.service";
import { PdfParseService, PdfTextResult } from "../../utils/parsers/pdf.service";
import { MammothService } from "../../utils/parsers/docx.service";


export class AIController {
    private aiService: AIService
    private ocrService: OCRService
    private pdfService: PdfParseService
    private mammothService: MammothService

    constructor(aiService: AIService, ocrService: OCRService, pdfService: PdfParseService, mammothService: MammothService) {
        this.aiService = aiService,
            this.ocrService = ocrService
        this.pdfService = pdfService
        this.mammothService = mammothService
    }

    getEmbeddingsHandler = async (req: Request, res: Response, next: NextFunction) => {
        try {

            const text = req.body.text;
            const answer = await this.aiService.getEmbedding(text);
            res.json({
                success: true,
                answer,
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                success: false,
                error: "Failed to generate embeddings",
            });
        }
    }


    fileParsingHandler = async (req: Request, res: Response, next: NextFunction) => {
        try {

            if (!req.file) {
                res.status(400).json({
                    success: false,
                    error: "Please provide a file",
                });
                return;
            }

            let result: any;

            // Add more documents
            if (req.file.mimetype.startsWith("image/")) {
                result = await this.ocrService.recognize(req.file.buffer)
            } else if (req.file.mimetype === "application/pdf") {
                result = await this.pdfService.extractText({ data: req.file.buffer })
            } else if (req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
                result = await this.mammothService.extractRawText({ buffer: req.file.buffer })
            } else {
                res.status(400).json({
                    success: false,
                    error: `Unsupported file type: ${req.file.mimetype}`,
                });
                return;
            }

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                success: false,
                error: "Failed to parse file",
            });
        }
    }


}