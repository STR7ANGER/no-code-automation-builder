import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@prisma/client";
import { bootstrapInput, credentialInput } from "@relay/contracts";
import type { Metrics } from "../../metrics.js";
import type { AesCredentialCipher, EncryptedValue } from "./cipher.js";

export type Principal = {
  userId: string;
  tenantId: string;
  role: Role;
};

export type WorkspaceRecord = {
  id: string;
  tenantId: string;
  name: string;
};

export type CredentialRecord = {
  id: string;
  workspaceId: string;
  name: string;
  connector: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface AccessRepository {
  bootstrap(input: {
    tenantName: string;
    tenantSlug: string;
    workspaceName: string;
    ownerEmail: string;
    tokenHash: string;
    prefix: string;
  }): Promise<
    { tenantId: string; workspaceId: string; userId: string } | "TENANT_EXISTS"
  >;
  principalForHash(hash: string): Promise<Principal | null>;
  listWorkspaces(tenantId: string): Promise<WorkspaceRecord[]>;
  saveCredential(input: {
    tenantId: string;
    actorId: string;
    workspaceId: string;
    name: string;
    connector: string;
    encrypted: EncryptedValue;
  }): Promise<CredentialRecord | "WORKSPACE_NOT_FOUND">;
  audit(tenantId: string): Promise<Record<string, unknown>[]>;
}

export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

const hashToken = (token: string, pepper: string) =>
  createHash("sha256").update(`${pepper}:${token}`).digest("hex");

export class AccessService {
  constructor(
    private readonly repository: AccessRepository,
    private readonly cipher: AesCredentialCipher,
    private readonly pepper: string,
    private readonly metrics: Metrics,
  ) {}

  async bootstrap(untrusted: unknown) {
    const input = bootstrapInput.parse(untrusted);
    const apiKey = `af_${randomBytes(32).toString("base64url")}`;
    const result = await this.repository.bootstrap({
      ...input,
      tokenHash: hashToken(apiKey, this.pepper),
      prefix: apiKey.slice(0, 14),
    });
    if (result === "TENANT_EXISTS")
      throw new DomainError(
        "TENANT_EXISTS",
        409,
        "The tenant slug is already registered.",
      );
    this.metrics.increment("tenants_created_total");
    return { ...result, apiKey };
  }

  async authenticate(header: string | undefined) {
    if (!header?.startsWith("Bearer "))
      throw new DomainError(
        "UNAUTHENTICATED",
        401,
        "A bearer API key is required.",
      );
    const token = header.slice(7);
    if (!token.startsWith("af_") || token.length < 40)
      throw new DomainError("UNAUTHENTICATED", 401, "Invalid API key.");
    const principal = await this.repository.principalForHash(
      hashToken(token, this.pepper),
    );
    if (!principal)
      throw new DomainError(
        "UNAUTHENTICATED",
        401,
        "Invalid or revoked API key.",
      );
    return principal;
  }

  listWorkspaces(principal: Principal) {
    return this.repository.listWorkspaces(principal.tenantId);
  }

  async saveCredential(principal: Principal, untrusted: unknown) {
    if (!["OWNER", "ADMIN"].includes(principal.role))
      throw new DomainError(
        "FORBIDDEN",
        403,
        "Credential administration requires owner or admin role.",
      );
    const input = credentialInput.parse(untrusted);
    const result = await this.repository.saveCredential({
      tenantId: principal.tenantId,
      actorId: principal.userId,
      workspaceId: input.workspaceId,
      name: input.name,
      connector: input.connector,
      encrypted: this.cipher.encrypt(input.value),
    });
    if (result === "WORKSPACE_NOT_FOUND")
      throw new DomainError(
        "WORKSPACE_NOT_FOUND",
        404,
        "Workspace was not found in this tenant.",
      );
    this.metrics.increment("credentials_written_total");
    return result;
  }

  audit(principal: Principal) {
    if (!["OWNER", "ADMIN"].includes(principal.role))
      throw new DomainError("FORBIDDEN", 403, "Audit access requires admin.");
    return this.repository.audit(principal.tenantId);
  }
}
