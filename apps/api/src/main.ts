import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { json } from "express";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ["log", "error", "warn"] });
  app.use(json({ limit: "2mb" }));
  app.enableCors({ origin: true, credentials: true });
  await app.listen(process.env.PORT || 3000);
}
bootstrap();

