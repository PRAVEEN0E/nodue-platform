import { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { env } from "../config/env";

export function errorHandler(error: FastifyError | AppError | Error, request: FastifyRequest, reply: FastifyReply) {
  request.log.error({
    err: error,
    reqId: request.id,
    url: request.raw.url,
    method: request.method,
  }, "Request error encountered");

  // Custom AppError
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId: request.id,
      },
    });
  }

  // Zod Validation Errors
  if (error instanceof ZodError) {
    const formattedErrors = error.errors.map((err) => ({
      path: err.path.join("."),
      message: err.message,
    }));

    return reply.status(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: formattedErrors,
        requestId: request.id,
      },
    });
  }

  // Malformed JSON body
  if (error instanceof SyntaxError || (error as FastifyError).statusCode === 400) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "BAD_REQUEST",
        message: error.message || "Invalid request payload",
        requestId: request.id,
      },
    });
  }

  // Fastify Schema Validation Error
  if ("validation" in error && error.validation) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: error.message,
        details: error.validation,
        requestId: request.id,
      },
    });
  }

  // Rate Limiting
  if ("statusCode" in error && error.statusCode === 429) {
    return reply.status(429).send({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please slow down.",
        requestId: request.id,
      },
    });
  }

  // JWT / Auth errors
  if (error.name === "UnauthorizedError" || ("statusCode" in error && error.statusCode === 401)) {
    return reply.status(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: error.message || "Authentication required",
        requestId: request.id,
      },
    });
  }

  // Prisma unique constraint violation (P2002)
  if ("code" in error && error.code === "P2002") {
    return reply.status(409).send({
      success: false,
      error: {
        code: "CONFLICT",
        message: "A record with this unique field already exists",
        requestId: request.id,
      },
    });
  }

  // Generic internal server error (never leak stack in production).
  // The requestId lets support correlate the safe client message with the
  // detailed server log line (which already carries reqId).
  const isProd = env.NODE_ENV === "production";
  return reply.status(500).send({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: isProd ? "Something went wrong. Request ID logged for support." : error.message,
      requestId: request.id,
      ...(isProd ? {} : { stack: error.stack }),
    },
  });
}
