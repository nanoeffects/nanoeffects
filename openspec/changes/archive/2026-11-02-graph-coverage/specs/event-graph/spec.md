## ADDED Requirements

### Requirement: Snapshots of different runs are joined
`mergeGraphs(...snapshots)` from `nanoeffects/trace` SHALL return one `GraphSnapshot` from the snapshots it gets, without changing them. A node with the same name SHALL be one node with the sum of the counts; an edge with the same `from` and `to` SHALL be one edge with the sum of the counts and `inCycle` true if it was in any. A node SHALL keep the `site` of the first snapshot that has one and the `last` of the last snapshot that has one. A cycle SHALL be kept once for the same `kind`, `source` and ring of names (the same ring found from another node is the same cycle); its `turns` SHALL add up and its `repeats` SHALL be the largest. The result SHALL take `name` from the first snapshot that has one. With no snapshot it SHALL return an empty graph. The result SHALL be plain data that `JSON.stringify` accepts and that `graphLogger().toJSON()` would accept as input again.

#### Scenario: Counts add up
- **WHEN** one snapshot has the edge `a` to `b` with count 2 and another has it with count 3
- **THEN** the merged graph has one edge `a` to `b` with count 5

#### Scenario: Union of nodes and edges
- **WHEN** the first snapshot has the edge `a` to `b` and the second has `a` to `c`
- **THEN** the merged graph has the nodes `a`, `b`, `c` and both edges

#### Scenario: The same cycle is one cycle
- **WHEN** both snapshots hold the cycle `a`, `b`, `a`, one of them found from `b` (`b`, `a`, `b`)
- **THEN** the merged graph has one cycle

#### Scenario: Inputs are not changed
- **WHEN** snapshots are merged
- **THEN** none of them is changed

#### Scenario: No snapshot
- **WHEN** `mergeGraphs()` is called with no argument
- **THEN** it returns a graph with no node, no edge and no cycle

### Requirement: Listeners the graph never saw are found
`findOrphans(described, snapshot)` from `nanoeffects/trace` SHALL take the result of `describeBus(bus)` and a `GraphSnapshot` and return the list of listeners whose node is not in the graph. Each item SHALL say the `event`, the `listener` name and a `kind`: `"unemitted"` when the graph has no node for the event, `"unrun"` when it has the node of the event but none for the listener. A listener whose name is `"<anonymous>"` SHALL NOT be listed, because the graph has no node for it. A name that `describeBus` wrote with `{ source: true }` (a trailing ` (file:line:column)`) SHALL be read as the name without it, and the `listener` of the item SHALL be that name. The function SHALL change neither argument and SHALL need no bus.

#### Scenario: A listener that did not run
- **WHEN** `described` is `{ "cart/added": ["recalc", "audit"] }` and the graph has the nodes `cart/added` and `recalc`
- **THEN** the result is `[{ event: "cart/added", listener: "audit", kind: "unrun" }]`

#### Scenario: An event that was never emitted
- **WHEN** `described` is `{ "cart/cleared": ["reset"] }` and the graph has no node `cart/cleared`
- **THEN** the result is `[{ event: "cart/cleared", listener: "reset", kind: "unemitted" }]`

#### Scenario: Anonymous listeners are left out
- **WHEN** a listener is named `"<anonymous>"`
- **THEN** it is not in the result

#### Scenario: Names with a source
- **WHEN** `described` has `recalc (src/cart.ts:12:3)` and the graph has the node `recalc`
- **THEN** that listener is not in the result

#### Scenario: Everything ran
- **WHEN** every named listener of `described` has a node in the graph
- **THEN** the result is an empty list

#### Scenario: Merged coverage
- **WHEN** a listener ran in the second of two merged snapshots only
- **THEN** it is an orphan of the first snapshot and not an orphan of the merged one
