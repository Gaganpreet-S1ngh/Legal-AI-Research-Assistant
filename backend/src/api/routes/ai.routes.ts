import { Router, Request, Response } from "express";
import { AIController } from "../controllers/ai.controller";
import { upload } from "../../config/multer.config";


export class AIRoutes {
    public router: Router;
    private aiController: AIController;


    constructor(aiController: AIController) {
        this.router = Router();
        this.aiController = aiController;
        this.initializeRoutes();
    }

    private initializeRoutes(): void {
        this.router.post("/embeddings", this.aiController.getEmbeddingsHandler);
        this.router.post("/embeddings/upload", upload.single("document"), this.aiController.getFileEmbeddingHandler)
    }

}