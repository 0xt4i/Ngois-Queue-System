import pino from "pino";

// JSON ra stdout — Vercel thu thập nguyên dòng log.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: { app: "photobooth-queue" },
  redact: ["phone", "*.phone", "password", "*.password"],
});
