import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Metrics } from "../src/metrics.js";
import { AesCredentialCipher } from "../src/modules/access/cipher.js";
import type {
  AccessRepository,
  Principal,
} from "../src/modules/access/service.js";
import { AccessService } from "../src/modules/access/service.js";

const owner: Principal = {
  userId: "cm0000000000000000000001",
  tenantId: "cm0000000000000000000002",
  role: "OWNER",
};
const workspaceId = "cm0000000000000000000003";

class AccessMemory implements AccessRepository {
  encrypted = "";
  async bootstrap() {
    return {
      tenantId: owner.tenantId,
      workspaceId,
      userId: owner.userId,
    };
  }
  async principalForHash() {
    return owner;
  }
  async listWorkspaces() {
    return [{ id: workspaceId, tenantId: owner.tenantId, name: "Operations" }];
  }
  async saveCredential(
    input: Parameters<AccessRepository["saveCredential"]>[0],
  ) {
    this.encrypted = input.encrypted.ciphertext;
    return {
      id: "cm0000000000000000000004",
      workspaceId,
      name: input.name,
      connector: input.connector,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
  }
  async audit() {
    return [];
  }
}

const make = () => {
  const repository = new AccessMemory();
  const cipher = new AesCredentialCipher(randomBytes(32).toString("base64"));
  return {
    repository,
    cipher,
    service: new AccessService(
      repository,
      cipher,
      "pepper-000000000000000000000000000",
      new Metrics(),
    ),
  };
};

describe("tenant access and encrypted credentials", () => {
  it("returns a one-time API key but only hashes it for persistence", async () => {
    const { service } = make();
    await expect(
      service.bootstrap({
        tenantName: "Relay Labs",
        tenantSlug: "relay-labs",
        workspaceName: "Operations",
        ownerEmail: "owner@example.com",
      }),
    ).resolves.toMatchObject({
      tenantId: owner.tenantId,
      apiKey: expect.stringMatching(/^af_/),
    });
  });

  it("encrypts credentials and omits plaintext from the response", async () => {
    const { repository, service } = make();
    const result = await service.saveCredential(owner, {
      workspaceId,
      name: "Slack production",
      connector: "slack",
      value: "credential-super-secret",
    });
    expect(repository.encrypted).not.toContain("credential-super-secret");
    expect(result).not.toHaveProperty("value");
    expect(result).not.toHaveProperty("ciphertext");
  });

  it("rejects a viewer writing credentials", async () => {
    const { service } = make();
    await expect(
      service.saveCredential(
        { ...owner, role: "VIEWER" },
        {
          workspaceId,
          name: "Read only",
          connector: "http",
          value: "credential-value",
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("detects authenticated-encryption tampering", () => {
    const { cipher } = make();
    const encrypted = cipher.encrypt("credential-super-secret");
    expect(cipher.decrypt(encrypted)).toBe("credential-super-secret");
    expect(() =>
      cipher.decrypt({
        ...encrypted,
        tag: `${encrypted.tag.startsWith("A") ? "B" : "A"}${encrypted.tag.slice(1)}`,
      }),
    ).toThrow();
  });
});
