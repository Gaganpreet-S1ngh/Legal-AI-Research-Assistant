import dotenv from "dotenv";
import path from "path";

const envPATH = path.join(__dirname, "../../", ".env");

dotenv.config({ path: envPATH });
