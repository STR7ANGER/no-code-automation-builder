# Visual draft contract

## Node and edge types

A graph contains at most 100 nodes and 200 edges. Nodes are `TRIGGER`,
`ACTION`, `CONDITION`, or bounded `LOOP` records with stable IDs, labels,
positions, and validated configuration. Edges reference existing endpoints and
carry `DEFAULT`, `TRUE`, `FALSE`, or `LOOP` branch intent.

Exactly one trigger is required, it cannot have an input, and every executable
node should be reachable. Conditions report missing true/false branches. Cyclic
edges are errors; iteration is modeled by a loop node with `maxIterations`
between 1 and 100 so the execution state space stays bounded.

## Autosave and undo

The browser keeps the last 50 graph snapshots for local undo. A 700 ms debounce
saves the complete typed graph with `expectedRevision`. PostgreSQL updates only
when that revision still matches; otherwise the API returns
`REVISION_CONFLICT` and the user must reload instead of overwriting another
editor.

Drafts may retain non-structural warnings so users can compose incrementally.
Diagnostics remain visible beside the canvas. Publishing, introduced in the
next milestone, rejects every error and requires explicit confirmation.

## Failure and accessibility review

Schema violations return a stable 422 response, cross-tenant identifiers return
404, and viewers receive 403. Save state is announced through an ARIA live
region. Forms remain keyboard accessible and node operations have toolbar
buttons; a production collaboration pass should add keyboard edge creation,
node-property dialogs, presence, and conflict diffing.
