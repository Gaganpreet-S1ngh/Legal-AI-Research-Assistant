import { Ollama } from "ollama";
import { HandleErrorWithLogger } from "./utils/errors";
import { httpLogger } from "./utils/logger";
import express, { NextFunction, Request, Response } from "express";
import { AIService } from "./services/ai.service";
import { AIController } from "./api/controllers/ai.controller";
import { AIRoutes } from "./api/routes/ai.routes";

export const expressApp = async () => {
  const app = express();

  app.use(express.json());
  app.use(httpLogger);

  app.get("/api", (req: Request, res: Response, next: NextFunction) => {
    res.status(200).json("I am healthy!");
  });

   const ollamaClient = new Ollama({ host: 'http://127.0.0.1:11434' })
   const aiService = new AIService(ollamaClient);
   const aiController = new AIController(aiService);
   const aIRoutes = new AIRoutes(aiController);

   app.use("/api/ai" , aIRoutes.router)



  app.use(HandleErrorWithLogger);

  return app;
};
