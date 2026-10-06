export type BillImage = {
  mimeType: string;
  bytes: Uint8Array;
};

export interface BillVision {
  parse(image: BillImage): Promise<unknown>;
}

const LOG_DETAIL_LIMIT = 300;
const ERROR_BODY_LIMIT = 4_096;

export class VisionProviderError extends Error {
  readonly code: "vision_unavailable" | "vision_unreadable";
  readonly providerStatus: number | null;
  readonly providerType: string | null;
  readonly providerCode: string | null;

  constructor(details: {
    code: "vision_unavailable" | "vision_unreadable";
    providerStatus: number | null;
    providerType: string | null;
    providerCode: string | null;
    detail: string;
  }) {
    const detail = truncate(details.detail, LOG_DETAIL_LIMIT);
    super(
      `vision provider failed status=${details.providerStatus ?? "none"} type=${details.providerType ?? "none"} code=${details.providerCode ?? "none"} message=${JSON.stringify(detail)}`,
    );
    this.name = "VisionProviderError";
    this.code = details.code;
    this.providerStatus = details.providerStatus;
    this.providerType = details.providerType;
    this.providerCode = details.providerCode;
  }
}

const billJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["currency", "items", "subtotal", "tax", "serviceCharge", "discount", "rounding", "taxIncluded", "total"],
  properties: {
    currency: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "unitPrice", "lineTotal"],
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
          lineTotal: { type: "number" },
        },
      },
    },
    subtotal: { type: "number" },
    tax: { type: "number" },
    serviceCharge: { type: "number" },
    discount: { type: "number" },
    rounding: { type: "number" },
    taxIncluded: { type: "boolean" },
    total: { type: "number" },
  },
} as const;

const SYSTEM_PROMPT = `You extract a restaurant bill from a photo into JSON.
Amounts are integer minor currency units. For IDR that means whole rupiah, with no thousands separators and no decimals.
currency is a short code such as IDR. Use IDR when the bill does not show another currency.
items is one entry per printed line: name, quantity, unitPrice, and lineTotal.
subtotal is the sum of line totals before tax, service, and discount.
tax, serviceCharge, and discount are amounts, not percentages. Use 0 when one is absent.
discount is a positive amount taken off the bill.
rounding is the pembulatan or cash-rounding line in whole rupiah. Positive if it increases the amount due, negative if it decreases it. Use 0 when there is no rounding line. Do not put pembulatan in items.
taxIncluded is true only when the item prices already include tax (termasuk pajak / tax included) and tax is not added again on top of the subtotal. In that case set tax to 0. Leave the included tax inside the item line totals; do not move it into rounding.
When tax is added on top (PPN, PB1), taxIncluded is false and tax is that added amount.
total is the amount due printed on the bill.
Indonesian bills may label tax as PPN or PB1 and service as service charge or SC.`;

export function createOpenAIVision(options: {
  apiKey: string;
  model: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): BillVision {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  return {
    async parse(image) {
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: options.model,
            temperature: 0,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "parsed_bill",
                strict: true,
                schema: billJsonSchema,
              },
            },
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: [
                  { type: "text", text: "Parse this restaurant bill." },
                  {
                    type: "image_url",
                    image_url: { url: `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString("base64")}` },
                  },
                ],
              },
            ],
          }),
          signal: AbortSignal.timeout(45_000),
        });
      } catch (error) {
        throw providerTransportError(error, [options.apiKey, imageBase64(image)]);
      }

      if (!response.ok) {
        throw await providerHttpError(response, [options.apiKey, imageBase64(image)]);
      }

      let body: { choices?: Array<{ message?: { content?: string | null } }> };
      try {
        body = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
      } catch {
        throw new VisionProviderError({
          code: "vision_unreadable",
          providerStatus: response.status,
          providerType: null,
          providerCode: null,
          detail: "response was not JSON",
        });
      }
      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        throw new VisionProviderError({
          code: "vision_unreadable",
          providerStatus: response.status,
          providerType: null,
          providerCode: null,
          detail: "empty response",
        });
      }
      try {
        return JSON.parse(content) as unknown;
      } catch {
        throw new VisionProviderError({
          code: "vision_unreadable",
          providerStatus: response.status,
          providerType: null,
          providerCode: null,
          detail: "invalid JSON",
        });
      }
    },
  };
}

function imageBase64(image: BillImage): string {
  return Buffer.from(image.bytes).toString("base64");
}

function providerTransportError(error: unknown, secrets: string[]): VisionProviderError {
  const name = error instanceof Error ? error.name : "Error";
  const timedOut = name === "TimeoutError" || name === "AbortError";
  const causeCode = readCauseCode(error);
  const raw = error instanceof Error ? error.message : "request failed";
  const detail = timedOut
    ? `timeout: ${name} ${redact(raw, secrets)}`
    : `network: ${name}${causeCode ? ` ${causeCode}` : ""} ${redact(raw, secrets)}`;
  return new VisionProviderError({
    code: "vision_unavailable",
    providerStatus: null,
    providerType: null,
    providerCode: null,
    detail,
  });
}

async function providerHttpError(response: Response, secrets: string[]): Promise<VisionProviderError> {
  const raw = await readBoundedText(response, ERROR_BODY_LIMIT);
  const parsed = parseProviderError(raw);
  const detail = redact(parsed.message ?? (raw.trim().length > 0 ? raw : `HTTP ${response.status}`), secrets);
  return new VisionProviderError({
    code: clientCodeForProviderFailure(response.status, parsed.type, parsed.code),
    providerStatus: response.status,
    providerType: parsed.type,
    providerCode: parsed.code,
    detail,
  });
}

function clientCodeForProviderFailure(
  status: number,
  providerType: string | null,
  providerCode: string | null,
): "vision_unavailable" | "vision_unreadable" {
  if (status === 401 || status === 402 || status === 403 || status === 408 || status === 429 || status >= 500) {
    return "vision_unavailable";
  }
  const token = `${providerType ?? ""} ${providerCode ?? ""}`.toLowerCase();
  if (/quota|rate_limit|billing|invalid_api_key|authentication|permission|access/.test(token)) {
    return "vision_unavailable";
  }
  return "vision_unreadable";
}

function parseProviderError(raw: string): { type: string | null; code: string | null; message: string | null } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = asRecord(parsed);
    const error = asRecord(record?.error) ?? record;
    if (!error) return { type: null, code: null, message: null };
    return {
      type: safeToken(error.type),
      code: safeToken(error.code),
      message: typeof error.message === "string" ? error.message : null,
    };
  } catch {
    return { type: null, code: null, message: null };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function safeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80 || !/^[A-Za-z0-9_.-]+$/.test(trimmed)) return null;
  return trimmed;
}

async function readBoundedText(response: Response, limit: number): Promise<string> {
  try {
    const text = await response.text();
    return text.length > limit ? text.slice(0, limit) : text;
  } catch {
    return "";
  }
}

function readCauseCode(error: unknown): string | null {
  if (!(error instanceof Error) || !error.cause || typeof error.cause !== "object" || !("code" in error.cause)) {
    return null;
  }
  const code = error.cause.code;
  return typeof code === "string" && /^[A-Za-z0-9_]+$/.test(code) ? code : null;
}

function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length >= 8) out = out.split(secret).join("[redacted]");
  }
  out = out.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  out = out.replace(/\bsk-[A-Za-z0-9*_-]{4,}\b/g, "[redacted]");
  out = out.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, "[image]");
  return out;
}

function truncate(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit)}…`;
}
