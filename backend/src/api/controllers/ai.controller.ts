import { NextFunction, Request, Response } from "express";
import { AIService } from "../../services/ai.service";
import { OCRService } from "../../utils/ocr/ocr.service";


export class AIController {
    private aiService: AIService
    private ocrService: OCRService

    constructor(aiService: AIService, ocrService: OCRService) {
        this.aiService = aiService,
            this.ocrService = ocrService
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
            console.log(req.file);
            const fileBuffer = req.file?.buffer || ""

            const result = await this.ocrService.recognize(fileBuffer)
            res.json({
                success: true,
                result
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