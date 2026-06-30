import { NextFunction, Request, Response } from "express";
import { AIService } from "../../services/ai.service";
import { ResultType } from "../../types/result.type";


export class AIController {
    private aiService: AIService

    constructor(aiService: AIService) {
        this.aiService = aiService
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


    getFileEmbeddingHandler = async (req: Request, res: Response, next: NextFunction) => {
        try {

            if (!req.file) {
                res.status(400).json({
                    success: false,
                    error: "Please provide a file",
                });
                return;
            }

            const result = await this.aiService.parseFile(req.file)
            const answer = await this.aiService.getEmbedding(result.text);

            res.json({
                success: true,
                answer,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({
                success: false,
                error: "Failed to get embedding for file",
            });
        }
    }


}