import { afterEach, describe, expect, it, vi } from "vitest";
import { serverGetJson, setServerFetcher } from "../src/server.js";
import type { ResolvedMesheryAuth } from "../src/config.js";

function auth(endpoint: string): ResolvedMesheryAuth {
  return {
    context: { name: "test", endpoint, tokenName: "default" },
    configPath: "config.yaml",
    tokenPath: "auth.json",
    tokenValue: "secret",
    providerValue: "Meshery",
  };
}

afterEach(() => setServerFetcher(undefined));

describe("server request transport", () => {
  it.each([
    "http://localhost:9081",
    "http://127.0.0.1:9081",
    "http://127.1.2.3:9081",
    "http://[::1]:9081",
    "https://meshery.example:9081",
  ])("sends cookies to %s", async (endpoint) => {
    const fetcher = vi.fn(async () => new Response("{}"));
    setServerFetcher(fetcher);
    await serverGetJson({ path: "/api/test", auth: auth(endpoint) });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      headers: { Cookie: "token=secret; meshery-provider=Meshery" },
    });
  });

  it.each([
    "http://meshery.example:9081",
    "http://192.168.1.2:9081",
    "http://localhost.example:9081",
    "http://127.0.0.1.example:9081",
    "http://[::2]:9081",
  ])("rejects authenticated requests to %s before fetching", async (endpoint) => {
    const fetcher = vi.fn(async () => new Response("{}"));
    setServerFetcher(fetcher);
    await expect(serverGetJson({ path: "/api/test", auth: auth(endpoint) }))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("HTTPS") });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("allows anonymous HTTP requests without cookies", async () => {
    const fetcher = vi.fn(async () => new Response("{}"));
    setServerFetcher(fetcher);
    await serverGetJson({ path: "/api/test", anonymous: true, auth: auth("http://meshery.example") });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: { Accept: "application/json" } });
    expect(fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty("Cookie");
  });
});
