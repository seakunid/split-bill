import { z } from "zod";

/** Multipart field name for `POST /bills/parse`. */
export const PARSE_IMAGE_FIELD_NAME = "image";

export const apiRoutes = {
  parseBill: "/bills/parse",
  bills: "/bills",
  bill: (id: string) => `/bills/${id}`,
} as const;

const moneySchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** Client-supplied item and payer ids, and server-generated bill ids. */
export const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const currencySchema = z.string().trim().min(3).max(8);

export const parsedItemSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    quantity: z.number().positive().finite(),
    unitPrice: moneySchema,
    lineTotal: moneySchema,
  })
  .strict();

/** Draft returned by `POST /bills/parse`. Not saved. */
export const parsedBillDraftSchema = z
  .object({
    currency: currencySchema,
    items: z.array(parsedItemSchema),
    subtotal: moneySchema,
    tax: moneySchema,
    serviceCharge: moneySchema,
    discount: moneySchema,
    total: moneySchema,
  })
  .strict();

export const itemInputSchema = parsedItemSchema.extend({
  id: idSchema,
});

export const payerInputSchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export const assignmentInputSchema = z
  .object({
    itemId: idSchema,
    payerId: idSchema,
  })
  .strict();

/** Body of `POST /bills` and `PUT /bills/:id`. */
export const billWriteSchema = z
  .object({
    currency: currencySchema.default("IDR"),
    items: z.array(itemInputSchema),
    payers: z.array(payerInputSchema),
    assignments: z.array(assignmentInputSchema),
    subtotal: moneySchema,
    tax: moneySchema,
    serviceCharge: moneySchema,
    discount: moneySchema,
    total: moneySchema,
    imageUrl: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict();

export const itemShareSchema = z
  .object({
    itemId: idSchema,
    name: z.string(),
    share: moneySchema,
  })
  .strict();

export const payerBreakdownSchema = z
  .object({
    payerId: idSchema,
    name: z.string(),
    items: z.array(itemShareSchema),
    subtotal: moneySchema,
    tax: moneySchema,
    serviceCharge: moneySchema,
    discount: moneySchema,
    total: z.number().int().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

/** Body of `POST /bills`, `GET /bills/:id`, and `PUT /bills/:id` responses. */
export const billResponseSchema = z
  .object({
    id: idSchema,
    currency: currencySchema,
    items: z.array(itemInputSchema),
    payers: z.array(payerInputSchema),
    assignments: z.array(assignmentInputSchema),
    subtotal: moneySchema,
    tax: moneySchema,
    serviceCharge: moneySchema,
    discount: moneySchema,
    total: moneySchema,
    imageUrl: z.string().nullable(),
    breakdown: z.array(payerBreakdownSchema),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const billIssueCodes = [
  "DUPLICATE_ITEM_ID",
  "DUPLICATE_PAYER_ID",
  "UNKNOWN_ITEM",
  "UNKNOWN_PAYER",
  "DUPLICATE_ASSIGNMENT",
  "UNASSIGNED_ITEM",
  "SUBTOTAL_MISMATCH",
  "TOTAL_MISMATCH",
] as const;

export const billIssueSchema = z
  .object({
    code: z.enum(billIssueCodes),
    message: z.string(),
    itemId: z.string().optional(),
    payerId: z.string().optional(),
  })
  .strict();

export const apiErrorSchema = z
  .object({
    error: z.string(),
    issues: z
      .array(
        z
          .object({
            code: z.string(),
            message: z.string(),
            itemId: z.string().optional(),
            payerId: z.string().optional(),
            path: z.array(z.union([z.string(), z.number()])).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export type ParsedItem = z.infer<typeof parsedItemSchema>;
export type ParsedBillDraft = z.infer<typeof parsedBillDraftSchema>;
export type ItemInput = z.infer<typeof itemInputSchema>;
export type PayerInput = z.infer<typeof payerInputSchema>;
export type AssignmentInput = z.infer<typeof assignmentInputSchema>;
export type BillWrite = z.infer<typeof billWriteSchema>;
export type BillWriteInput = z.input<typeof billWriteSchema>;
export type ItemShare = z.infer<typeof itemShareSchema>;
export type PayerBreakdown = z.infer<typeof payerBreakdownSchema>;
export type BillResponse = z.infer<typeof billResponseSchema>;
export type BillIssueCode = (typeof billIssueCodes)[number];
export type BillIssue = z.infer<typeof billIssueSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
