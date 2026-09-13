import { FastifyRequest } from "fastify";
import { ZodSchema } from "zod";

export function validateBody(schema: ZodSchema) {
  return async (request: FastifyRequest) => {
    request.body = await schema.parseAsync(request.body);
  };
}

export function validateQuery(schema: ZodSchema) {
  return async (request: FastifyRequest) => {
    // Strip empty-string query values before Zod parsing.
    // URLSearchParams serializes empty selects/inputs as key= (empty string),
    // which fails z.enum / z.string().uuid checks.  Treating "" as absent is
    // the correct semantic for optional query filters.
    const raw = request.query as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value !== "" && value !== undefined && value !== null) {
        cleaned[key] = value;
      }
    }
    request.query = await schema.parseAsync(cleaned);
  };
}

export function validateParams(schema: ZodSchema) {
  return async (request: FastifyRequest) => {
    request.params = await schema.parseAsync(request.params);
  };
}
