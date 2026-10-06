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
});
