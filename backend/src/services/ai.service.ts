import { Ollama } from "ollama";
import { logger } from "../utils/logger";
import { MammothService } from "../utils/parsers/docx.service";
import { OCRService } from "../utils/parsers/ocr.service";
import { PdfParseService } from "../utils/parsers/pdf.service";
import { ResultType } from "../types/result.type";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export class AIService {

    private readonly aiModel = "phi4-mini";
    private readonly embeddingModel = "nomic-embed-text";
    private ollama: Ollama;
    private ocrService: OCRService
    private mammothService: MammothService
    private pdfService: PdfParseService

    // auth

    constructor(ollamaClient: Ollama, ocrService: OCRService, mammothService: MammothService, pdfService: PdfParseService) {
        this.ollama = ollamaClient;
        this.ocrService = ocrService;
        this.pdfService = pdfService;
        this.mammothService = mammothService;
    }

    async getEmbedding(text: string): Promise<any> {
        try {

            // Chunk Text first
            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 500,
                chunkOverlap: 150, // preserve context accross splits or boundaries
                separators: ["\n\n", "\n", ". ", " ", ""], // try in order
            })

            const chunks = await splitter.splitText(text);
            const BATCH_SIZE = 50; // Avoid huge single request (50 chunks)
            const result: any = [];

            console.log(chunks)

            for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
                const batch = chunks.slice(i, i + BATCH_SIZE); // batch = 50 chunks
                console.log(batch);
                const response = await this.ollama.embed({
                    model: this.embeddingModel,
                    input: batch
                })

                console.log(response);
                batch.forEach((chunk, j) => {
                    result.push({
                        id: `ID-${i + j}`,
                        text: chunk,
                        embedding: response.embeddings[j],
                        metadata: { chunkID: `ID-${i + j}`, chunkIndex: i + j },
                    })
                })
            }

            return result

        } catch (error) {
            logger.error(error, "Error getting embeddings");
            throw error;
        }
    }

    // HELPER FUNCTIONS
    async parseFile(file: Express.Multer.File): Promise<ResultType> {
        try {

            let result: ResultType;
            // Add more documents
            if (file.mimetype.startsWith("image/")) {
                result = await this.ocrService.recognize(file.buffer)
            } else if (file.mimetype === "application/pdf") {
                result = await this.pdfService.extractText({ data: file.buffer })
            } else if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
                result = await this.mammothService.extractRawText({ buffer: file.buffer })
            } else {
                throw new Error(`Unsupported file type: ${file.mimetype}`)
            }

            return result

        } catch (error) {
            logger.error(error, "Error parsing file");
            throw error;
        }
    }
}




