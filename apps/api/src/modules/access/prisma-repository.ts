import { prisma } from "../../db.js";
import type { AccessRepository } from "./service.js";

export class PrismaAccessRepository implements AccessRepository {
  async bootstrap(input: Parameters<AccessRepository["bootstrap"]>[0]) {
    const existing = await prisma.tenant.findUnique({
      where: { slug: input.tenantSlug },
      select: { id: true },
    });
    if (existing) return "TENANT_EXISTS" as const;
    return prisma.$transaction(async (transaction) => {
      const user = await transaction.user.upsert({
        where: { email: input.ownerEmail },
        update: {},
        create: { email: input.ownerEmail },
      });
      const tenant = await transaction.tenant.create({
        data: {
          name: input.tenantName,
          slug: input.tenantSlug,
          memberships: { create: { userId: user.id, role: "OWNER" } },
        },
      });
      const workspace = await transaction.workspace.create({
        data: { tenantId: tenant.id, name: input.workspaceName },
      });
      await transaction.apiKey.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          name: "Bootstrap owner key",
          prefix: input.prefix,
          tokenHash: input.tokenHash,
        },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: tenant.id,
          actorId: user.id,
          action: "tenant.bootstrapped",
          target: "Tenant",
          targetId: tenant.id,
          metadata: { workspaceId: workspace.id },
        },
      });
      return {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        userId: user.id,
      };
    });
  }

  async principalForHash(tokenHash: string) {
    const key = await prisma.apiKey.findUnique({
      where: { tokenHash },
      include: { user: { include: { memberships: true } } },
    });
    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= new Date()))
      return null;
    const membership = key.user.memberships.find(
      (entry) => entry.tenantId === key.tenantId,
    );
    if (!membership) return null;
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });
    return {
      userId: key.userId,
      tenantId: key.tenantId,
      role: membership.role,
    };
  }

  listWorkspaces(tenantId: string) {
    return prisma.workspace.findMany({
      where: { tenantId },
      select: { id: true, tenantId: true, name: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async saveCredential(
    input: Parameters<AccessRepository["saveCredential"]>[0],
  ) {
    const workspace = await prisma.workspace.findFirst({
      where: { id: input.workspaceId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!workspace) return "WORKSPACE_NOT_FOUND" as const;
    return prisma.$transaction(async (transaction) => {
      const credential = await transaction.credential.upsert({
        where: {
          workspaceId_name: {
            workspaceId: input.workspaceId,
            name: input.name,
          },
        },
        update: {
          connector: input.connector,
          ciphertext: input.encrypted.ciphertext,
          iv: input.encrypted.iv,
          tag: input.encrypted.tag,
        },
        create: {
          workspaceId: input.workspaceId,
          name: input.name,
          connector: input.connector,
          ciphertext: input.encrypted.ciphertext,
          iv: input.encrypted.iv,
          tag: input.encrypted.tag,
        },
        select: {
          id: true,
          workspaceId: true,
          name: true,
          connector: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: input.tenantId,
          actorId: input.actorId,
          action: "credential.written",
          target: "Credential",
          targetId: credential.id,
          metadata: {
            workspaceId: input.workspaceId,
            connector: input.connector,
            valueExposed: false,
          },
        },
      });
      return credential;
    });
  }

  audit(tenantId: string) {
    return prisma.auditEvent.findMany({
      where: { tenantId },
      select: {
        id: true,
        actorId: true,
        action: true,
        target: true,
        targetId: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
