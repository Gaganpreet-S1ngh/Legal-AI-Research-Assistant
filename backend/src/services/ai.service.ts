import { Ollama } from "ollama";
import { logger } from "../utils/logger";

export class AIService {

    private readonly aiModel = "phi4-mini";
    private readonly embeddingModel = "nomic-embed-text";
    private ollama: Ollama;

    // auth

    constructor(ollamaClient: Ollama) {
        this.ollama = ollamaClient;
    }

    async getEmbedding(text: string): Promise <number[]>{
        try {
            const response = await this.ollama.embed({
                model: this.embeddingModel,
                input: text
            })

            console.log(response);
            return response.embeddings[0];
            
        } catch (error) {
            logger.error(error , "Error getting embeddings");
            throw error;
        }
    }

}
