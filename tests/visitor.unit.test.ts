import { describe, it, expect } from "vitest";
import { ipNetwork, privateKey } from "../server/security";

const env = { SPAM_SECRET: "x".repeat(32) } as never;
const req = (ip: string) =>
  new Request("https://hakushu.example/api/public/x", {
    headers: { "CF-Connecting-IP": ip },
  });

describe("visitor id", () => {
  it("keeps IPv4 as it is", () => {
    expect(ipNetwork("203.0.113.7")).toBe("203.0.113.7");
  });
  it("takes the first 64 bits of IPv6", () => {
    expect(ipNetwork("2400:4050:a1b2:c300:1d2e:3f4a:5b6c:7d8e")).toBe(
      "2400:4050:a1b2:c300::/64",
    );
    expect(ipNetwork("2400:4050:0:c300::1")).toBe("2400:4050:0:c300::/64");
    expect(ipNetwork("2400:4050::1")).toBe("2400:4050:0:0::/64");
    expect(ipNetwork("2400:4050:A1B2:00C3:1::")).toBe("2400:4050:a1b2:c3::/64");
  });
  it("is the same person after the IPv6 address changes on the same line", async () => {
    const a = await privateKey(req("2400:4050:a1b2:c300:1111:2222:3333:4444"), env, "visitor", true);
    const b = await privateKey(req("2400:4050:a1b2:c300:aaaa:bbbb:cccc:dddd"), env, "visitor", true);
    const other = await privateKey(req("2400:4050:a1b2:c301:1111:2222:3333:4444"), env, "visitor", true);
    expect(a).toBe(b);
    expect(a).not.toBe(other);
  });
  it("keeps the IPv4 id from before", async () => {
    expect(await privateKey(req("203.0.113.7"), env, "visitor", true)).toBe(
      await privateKey(req("203.0.113.7"), env, "visitor"),
    );
  });
});
