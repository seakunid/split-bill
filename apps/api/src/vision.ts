export type BillImage = {
  mimeType: string;
  bytes: Uint8Array;
};

export interface BillVision {
  parse(image: BillImage): Promise<unknown>;
}

export class VisionProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisionProviderError";
  }
}

const billJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["currency", "items", "subtotal", "tax", "serviceCharge", "discount", "total"],
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
total is the amount due.
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
        const message = error instanceof Error ? error.message : "request failed";
        throw new VisionProviderError(`Vision provider request failed: ${message}`);
      }

      if (!response.ok) {
        throw new VisionProviderError(`Vision provider returned HTTP ${response.status}`);
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        throw new VisionProviderError("Vision provider returned an empty response");
      }
      try {
        return JSON.parse(content) as unknown;
      } catch {
        throw new VisionProviderError("Vision provider returned invalid JSON");
      }
    },
  };
}
