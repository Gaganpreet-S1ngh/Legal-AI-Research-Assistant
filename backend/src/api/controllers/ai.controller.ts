import { NextFunction, Request, Response } from "express";
import { AIService } from "../../services/ai.service";


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


}