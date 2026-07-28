import type { Request } from 'express';
import type { ZodTypeAny, output } from 'zod';

export function parseBody<S extends ZodTypeAny>(schema: S, req: Request): output<S> {
  return schema.parse(req.body) as output<S>;
}

export function parseQuery<S extends ZodTypeAny>(schema: S, req: Request): output<S> {
  return schema.parse(req.query) as output<S>;
}
