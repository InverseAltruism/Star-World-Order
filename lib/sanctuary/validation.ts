import { z } from 'zod';

export const ethAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid Ethereum address format');

export const tokenId = z.coerce
  .number()
  .int('Token ID must be an integer')
  .min(1, 'Token ID must be at least 1')
  .max(3333, 'Token ID must be at most 3333');

export const paginationPage = z.coerce
  .number()
  .int()
  .min(1)
  .default(1);

export const paginationLimit = (max: number, fallback: number) =>
  z.coerce.number().int().min(1).max(max).default(fallback);

export const interactAction = z.enum(['feed', 'pet', 'talk', 'sleep', 'play']);

export const nftTraitsAction = z.enum(['distribution', 'filter']);

export function parseSearchParams<T extends z.ZodType>(
  schema: T,
  searchParams: URLSearchParams,
) {
  const raw: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    raw[key] = value;
  }
  return schema.safeParse(raw) as { success: true; data: z.infer<T> } | { success: false; error: z.ZodError };
}

export function parseBody<T extends z.ZodType>(
  schema: T,
  body: unknown,
) {
  return schema.safeParse(body) as { success: true; data: z.infer<T> } | { success: false; error: z.ZodError };
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
}
