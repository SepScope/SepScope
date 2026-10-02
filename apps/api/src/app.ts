import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { VERSION } from "@sepscope/core";
import type { Database } from "@sepscope/db";
import { sql } from "drizzle-orm";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { getAnchor, getHistory, listAnchors } from "./queries.js";
import * as s from "./schemas.js";

export interface AppOptions {
  db: Database;
  rateLimitPerMinute: number;
  logger?: FastifyServerOptions["logger"];
  trustProxy?: boolean | number;
  /** Injectable clock for uptime and history windows. */
  now?: () => Date;
}

const notFound = (domain: string) => ({ statusCode: 404, error: "Not Found", message: `Unknown anchor: ${domain}` });

export async function buildApp(options: AppOptions) {
  const now = options.now ?? (() => new Date());
  const hops = options.trustProxy;
  const app = Fastify({
    logger: options.logger ?? false,
    // A hop count trusts that many proxies nearest the server.
    trustProxy: typeof hops === "number" ? (_addr: string, hop: number) => hop < hops : (hops ?? false),
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Read-only and public: any origin may GET.
  await app.register(cors, { origin: "*", methods: ["GET", "HEAD"] });
  await app.register(rateLimit, { max: options.rateLimitPerMinute, timeWindow: "1 minute" });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "SEPscope API",
        version: VERSION,
        description: "Open health, compliance, and uptime data for Stellar anchors. Read-only.",
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.get(
    "/healthz",
    {
      // Probes from orchestrators should never be throttled.
      config: { rateLimit: false },
      schema: {
        summary: "Liveness and database connectivity",
        tags: ["meta"],
        response: { 200: s.health, 503: s.errorResponse },
      },
    },
    async (_req, reply) => {
      try {
        await options.db.execute(sql`select 1`);
        return { status: "ok" as const };
      } catch (err) {
        _req.log.error({ err }, "health check failed");
        return reply.code(503).send({ statusCode: 503, error: "Service Unavailable", message: "Database unavailable" });
      }
    },
  );

  app.get(
    "/v1/anchors",
    {
      schema: {
        summary: "List anchors with their latest score, uptime, and last-checked time",
        tags: ["anchors"],
        querystring: s.listQuery,
        response: { 200: s.anchorSummary.array() },
      },
    },
    (req) => listAnchors(options.db, now(), { network: req.query.network }),
  );

  app.get(
    "/v1/anchors/:domain",
    {
      schema: {
        summary: "An anchor's latest result for each check",
        tags: ["anchors"],
        params: s.domainParams,
        response: { 200: s.anchorDetail, 404: s.errorResponse },
      },
    },
    async (req, reply) => {
      const anchor = await getAnchor(options.db, req.params.domain, now());
      return anchor ?? reply.code(404).send(notFound(req.params.domain));
    },
  );

  app.get(
    "/v1/anchors/:domain/history",
    {
      schema: {
        summary: "Results over the last 24 hours or 7 days, for one check or all",
        tags: ["anchors"],
        params: s.domainParams,
        querystring: s.historyQuery,
        response: { 200: s.history, 404: s.errorResponse },
      },
    },
    async (req, reply) => {
      const { domain } = req.params;
      const { check, range } = req.query;
      const results = await getHistory(options.db, domain, { check, range, now: now() });
      if (!results) return reply.code(404).send(notFound(domain));
      return { domain, check: check ?? null, range, results };
    },
  );

  return app;
}

