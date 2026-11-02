## ADDED Requirements

### Requirement: devPlugin follows the requests of a handler
On Node (where `AsyncLocalStorage` is available), `devPlugin` SHALL attribute each `fetch` request to the task that made it, also after `await`, and SHALL count a request as a lost signal of kind `request` when its task is aborted while the request is still running and the request did not stop: it got no signal, or a signal that did not abort. A request that finished before the abort, or that stopped with the abort, SHALL NOT be counted. The lost signal SHALL name the handler and the url, `getLostSignalsCount` SHALL include it, and one warning SHALL be written for each handler and url. A request that starts after its task was already aborted SHALL be counted the same way. The option `requests: false` SHALL turn the tracking off, and `disconnect` SHALL put `fetch` back. Where `AsyncLocalStorage` is not available (a browser), nothing SHALL be tracked and nothing SHALL fail.

#### Scenario: A request without a signal
- **WHEN** a handler under `latest` calls `fetch(url)` with no signal and a newer call cancels it
- **THEN** `getLostSignalsCount(bus)` counts one lost signal of kind `request` with the url

#### Scenario: A request with the signal of the task
- **WHEN** the handler calls `fetch(url, { signal: ctx.signal })`
- **THEN** nothing is counted

#### Scenario: A signal that is not the task's
- **WHEN** the handler calls `fetch` with the signal of an `AbortController` of its own
- **THEN** the request is counted

#### Scenario: A request that already finished
- **WHEN** the request finished before the cancel
- **THEN** it is not counted

#### Scenario: The caller's own requests
- **WHEN** test code calls `fetch` after `bus.emit` returned
- **THEN** that request is not attributed to a task

#### Scenario: Off and disconnected
- **WHEN** `requests: false` is set, or the plugin is disconnected
- **THEN** nothing is counted and `fetch` is the function it was before
