import { pino } from "pino";

/** Variables the dashboard server reads; each must be documented in .env.example. */
export const ENV_VARS = ["API_URL", "NEXT_PUBLIC_API_URL", "LOG_LEVEL", "PORT", "HOSTNAME"] as const;

/** Structured JSON logs for the dashboard's own server-side events. */
export const logger = pino({ level: process.env.LOG_LEVEL || "info" });
