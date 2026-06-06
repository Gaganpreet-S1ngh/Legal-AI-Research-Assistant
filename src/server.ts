import "./config/env.config";
import { expressApp } from "./expressApp";
import { logger } from "./utils/logger";

const PORT = process.env.PORT;

const StartServer = async () => {
  const ExpressApp = await expressApp();

  ExpressApp.listen(PORT, () => {
    logger.info(`Listening to http://localhost:${PORT}`);
  });

  process.on("uncaughtException", async (err) => {
    logger.error(err);
    process.exit(1);
  });
};

StartServer().then(() => {
  logger.info("Server is up!");
});
