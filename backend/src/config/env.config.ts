import dotenv from "dotenv";
import path from "path";

const envPATH = path.join(__dirname, "../../", ".env");

console.log(envPATH);

dotenv.config({ path: envPATH });
