import { describe, expect, it } from "vitest";
import { createOpenAIVision, VisionProviderError } from "./vision.js";

const image = { mimeType: "image/jpeg", bytes: Uint8Array.from([1, 2, 3]) };

describe("createOpenAIVision", () => {
  it("sends the image to the chat completions endpoint and parses the JSON content", async () => {
    const seen: { url?: string; authorization?: string; body?: unknown } = {};
    const vision = createOpenAIVision({
      apiKey: "test-key",
      model: "gpt-4o",
      baseUrl: "https://example.test/v1/",
      fetchImpl: async (input, init) => {
        seen.url = String(input);
        seen.authorization = new Headers(init?.headers).get("authorization") ?? undefined;
        seen.body = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ currency: "IDR", items: [] }) } }],
          }),
          { status: 200 },
        );
      },
    });

    await expect(vision.parse(image)).resolves.toEqual({ currency: "IDR", items: [] });
    expect(seen.url).toBe("https://example.test/v1/chat/completions");
    expect(seen.authorization).toBe("Bearer test-key");
    const body = seen.body as {
      model: string;
      messages: Array<{ content: string | Array<{ type: string; image_url?: { url: string } }> }>;
    };
    expect(body.model).toBe("gpt-4o");
    const schema = (seen.body as { response_format: { json_schema: { schema: { required: string[] } } } }).response_format
      .json_schema.schema;
    expect(schema.required).toEqual(expect.arrayContaining(["rounding", "taxIncluded", "total"]));
    const user = body.messages[1]?.content;
    expect(Array.isArray(user)).toBe(true);
    if (!Array.isArray(user)) return;
    expect(user.find((part) => part.type === "image_url")?.image_url?.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("throws when the provider returns an error status", async () => {
    const vision = createOpenAIVision({
      apiKey: "test-key",
      model: "gpt-4o",
      baseUrl: "https://example.test/v1",
      fetchImpl: async () => new Response("no", { status: 429 }),
    });
    await expect(vision.parse(image)).rejects.toBeInstanceOf(VisionProviderError);
  });

  it("keeps the provider status, type, and code, and strips the key and image", async () => {
    const apiKey = "sk-test-secret-key-value";
    const bytes = Uint8Array.from(Buffer.from("bill-photo-bytes-not-a-real-image"));
    const leaked = Buffer.from(bytes).toString("base64");
    const vision = createOpenAIVision({
      apiKey,
      model: "gpt-4o",
      baseUrl: "https://example.test/v1",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: {
              message: `Incorrect API key provided: ${apiKey}. Authorization: Bearer ${apiKey}. image ${leaked}`,
              type: "invalid_request_error",
              code: "invalid_api_key",
            },
          }),
          { status: 401 },
        ),
    });

    const error = await vision.parse({ mimeType: "image/jpeg", bytes }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(VisionProviderError);
    if (!(error instanceof VisionProviderError)) return;
    expect(error.code).toBe("vision_unavailable");
    expect(error.providerStatus).toBe(401);
    expect(error.providerType).toBe("invalid_request_error");
    expect(error.providerCode).toBe("invalid_api_key");
    expect(error.message).toContain("status=401");
    expect(error.message).toContain("invalid_api_key");
    expect(error.message).toContain("[redacted]");
    expect(error.message).not.toContain(apiKey);
    expect(error.message).not.toContain(leaked);
    expect(error.message).not.toContain("Bearer sk-");
  });

  it("treats a provider quota 429 as unavailable and keeps the provider message", async () => {
    const vision = createOpenAIVision({
      apiKey: "sk-test-secret-key-value",
      model: "gpt-4o",
      baseUrl: "https://example.test/v1",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "You exceeded your current quota, please check your plan and billing details.",
              type: "insufficient_quota",
              code: "insufficient_quota",
            },
          }),
          { status: 429 },
        ),
    });
    const error = await vision.parse(image).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(VisionProviderError);
    if (!(error instanceof VisionProviderError)) return;
    expect(error.code).toBe("vision_unavailable");
    expect(error.providerStatus).toBe(429);
    expect(error.providerCode).toBe("insufficient_quota");
    expect(error.message).toContain("You exceeded your current quota");
  });

  it("truncates a long provider body", async () => {
    const vision = createOpenAIVision({
      apiKey: "sk-test-secret-key-value",
      model: "gpt-4o",
      baseUrl: "https://example.test/v1",
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { message: "x".repeat(5_000), type: "server_error", code: "internal" } }), {
          status: 500,
        }),
    });
    const error = await vision.parse(image).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(VisionProviderError);
    if (!(error instanceof VisionProviderError)) return;
    expect(error.message.length).toBeLessThan(500);
    expect(error.message).not.toContain("x".repeat(400));
    expect(error.message).toContain("…");
  });

  it("describes timeouts and network failures without the request body", async () => {
    const apiKey = "sk-test-secret-key-value";
    const bytes = Uint8Array.from(Buffer.from("bill-photo-bytes-not-a-real-image"));
    const leaked = Buffer.from(bytes).toString("base64");
    const timeout = createOpenAIVision({
      apiKey,
      model: "gpt-4o",
      baseUrl: "https://example.test/v1",
      fetchImpl: async () => {
        throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
      },
    });
    const timedOut = await timeout.parse({ mimeType: "image/jpeg", bytes }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(timedOut).toBeInstanceOf(VisionProviderError);
    if (!(timedOut instanceof VisionProviderError)) return;
    expect(timedOut.code).toBe("vision_unavailable");
    expect(timedOut.providerStatus).toBeNull();
    expect(timedOut.message).toContain("timeout: TimeoutError");

    const network = createOpenAIVision({
      apiKey,
      model: "gpt-4o",
      baseUrl: "https://example.test/v1",
      fetchImpl: async (_input, init) => {
        throw Object.assign(new TypeError(`fetch failed Authorization: Bearer ${apiKey} ${String(init?.body)}`), {
          cause: { code: "ECONNREFUSED" },
        });
      },
    });
    const refused = await network.parse({ mimeType: "image/jpeg", bytes }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(refused).toBeInstanceOf(VisionProviderError);
    if (!(refused instanceof VisionProviderError)) return;
    expect(refused.message).toContain("network: TypeError ECONNREFUSED");
    expect(refused.message).not.toContain(apiKey);
    expect(refused.message).not.toContain(leaked);
  });

  it("treats config and account errors as unavailable, and an image rejection as unreadable", async () => {
    const cases: Array<{ status: number; body: unknown; code: "vision_unavailable" | "vision_unreadable" }> = [
      {
        status: 404,
        body: {
          error: {
            message: "The model `gpt-4o` does not exist or you do not have access to it.",
            type: "invalid_request_error",
            code: "model_not_found",
          },
        },
        code: "vision_unavailable",
      },
      {
        status: 403,
        body: { error: { message: "You do not have access to this model.", type: "invalid_request_error", code: null } },
        code: "vision_unavailable",
      },
      {
        status: 400,
        body: {
          error: {
            message: "Invalid parameter: 'response_format' of type 'json_schema' is not supported with this model.",
            type: "invalid_request_error",
            param: "response_format",
            code: null,
          },
        },
        code: "vision_unavailable",
      },
      {
        status: 400,
        body: { error: { message: "Invalid image.", type: "invalid_request_error", code: "invalid_image" } },
        code: "vision_unreadable",
      },
    ];

    for (const entry of cases) {
      const vision = createOpenAIVision({
        apiKey: "sk-test-secret-key-value",
        model: "gpt-4o",
        baseUrl: "https://example.test/v1",
        fetchImpl: async () => new Response(JSON.stringify(entry.body), { status: entry.status }),
      });
      await expect(vision.parse(image)).rejects.toMatchObject({ code: entry.code, providerStatus: entry.status });
    }
  });

  it("marks an empty or invalid model payload as unreadable", async () => {
    const empty = createOpenAIVision({
      apiKey: "sk-test-secret-key-value",
      model: "gpt-4o",
      baseUrl: "https://example.test/v1",
      fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 }),
    });
    await expect(empty.parse(image)).rejects.toMatchObject({ code: "vision_unreadable", message: expect.stringContaining("empty response") });

    const invalid = createOpenAIVision({
      apiKey: "sk-test-secret-key-value",
      model: "gpt-4o",
      baseUrl: "https://example.test/v1",
      fetchImpl: async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 200 }),
    });
    await expect(invalid.parse(image)).rejects.toMatchObject({
      code: "vision_unreadable",
      message: expect.stringContaining("invalid JSON"),
    });
  });
});
