import { HandleErrorWithLogger } from "./utils/errors";
import { httpLogger } from "./utils/logger";
import express, { NextFunction, Request, Response } from "express";

export const expressApp = async () => {
  const app = express();

  app.use(express.json());
  app.use(httpLogger);

  app.get("/", (req: Request, res: Response, next: NextFunction) => {
    res.status(200).json("I am healthy!");
  });

  app.use(HandleErrorWithLogger);

  return app;
};
