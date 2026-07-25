import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildSchema,
  execute,
  GraphQLError,
  Kind,
  parse,
  type SelectionSetNode,
} from "graphql";
import { Hono } from "hono";
import type { AccessService, Principal } from "../access/service.js";
import { DomainError } from "../access/service.js";
import type { WorkflowService } from "./service.js";

const schemaPath = fileURLToPath(
  new URL("../../../../../packages/contracts/schema.graphql", import.meta.url),
);
const schema = buildSchema(await readFile(schemaPath, "utf8"));

const cost = (selection: SelectionSetNode, depth = 1): [number, number] => {
  let fields = 0;
  let maximumDepth = depth;
  for (const item of selection.selections) {
    if (item.kind !== Kind.FIELD) continue;
    fields += 1;
    if (item.selectionSet) {
      const [nestedFields, nestedDepth] = cost(item.selectionSet, depth + 1);
      fields += nestedFields;
      maximumDepth = Math.max(maximumDepth, nestedDepth);
    }
  }
  return [fields, maximumDepth];
};

const coded = (error: unknown) => {
  if (error instanceof DomainError)
    return new GraphQLError(error.message, {
      extensions: { code: error.code },
    });
  return error;
};

export const createGraphqlRoutes = (
  workflows: WorkflowService,
  access: AccessService,
) => {
  const routes = new Hono();
  routes.post("/", async (context) => {
    try {
      const principal = await access.authenticate(
        context.req.header("authorization"),
      );
      const body = (await context.req.json()) as {
        query?: unknown;
        variables?: Record<string, unknown>;
        operationName?: string;
      };
      if (typeof body.query !== "string" || body.query.length > 100_000)
        return context.json({ errors: [{ message: "Invalid query." }] }, 422);
      const document = parse(body.query);
      let fields = 0;
      let depth = 0;
      for (const definition of document.definitions)
        if (definition.kind === Kind.OPERATION_DEFINITION) {
          const measured = cost(definition.selectionSet);
          fields += measured[0];
          depth = Math.max(depth, measured[1]);
        }
      if (depth > 8 || fields > 500)
        return context.json(
          { errors: [{ message: "Query exceeds depth or complexity limit." }] },
          422,
        );
      const root = {
        workflow: async (
          args: { id: string; include?: string[] },
          auth: Principal,
        ) => {
          try {
            const include = (args.include ?? ["DRAFT"]).map((value) =>
              value === "LATEST_EXECUTION"
                ? "latestExecution"
                : value.toLowerCase(),
            );
            return await workflows.query(auth, {
              workflowId: args.id,
              include,
            });
          } catch (error) {
            throw coded(error);
          }
        },
        publishWorkflow: async (
          args: { input: Record<string, unknown> },
          auth: Principal,
        ) => {
          try {
            return await workflows.publish(auth, args.input);
          } catch (error) {
            throw coded(error);
          }
        },
      };
      const result = await execute({
        schema,
        document,
        rootValue: root,
        contextValue: principal,
        variableValues: body.variables,
        ...(body.operationName ? { operationName: body.operationName } : {}),
      });
      return context.json(result);
    } catch (error) {
      const mapped = coded(error);
      if (mapped instanceof GraphQLError)
        return context.json({ errors: [mapped.toJSON()] }, 400);
      throw error;
    }
  });
  return routes;
};
