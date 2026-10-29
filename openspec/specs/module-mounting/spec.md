# module-mounting Specification

## Purpose
Mount and unmount several modules with one call, so an app can start its domains explicitly instead of relying on the first use of the bus.

## Requirements

### Requirement: mount and unmount take any number of modules
`app.mount` and `app.unmount` SHALL accept any number of modules as separate arguments. One module SHALL behave as before. Each argument SHALL have the module type of the bus, so a value that is not a module of the bus is a type error.

#### Scenario: One module as before
- **WHEN** `app.mount(userModule)` is called
- **THEN** `userModule` is mounted, the call returns the function that unmounts it, and nothing else changes

#### Scenario: Several modules are mounted in order
- **WHEN** `app.mount(a, b, c)` is called
- **THEN** `a`, `b` and `c` are mounted in that order, and `app.isMounted` is true for each

#### Scenario: Wrong argument
- **WHEN** one of the arguments is not a module
- **THEN** TypeScript rejects the call

### Requirement: Several modules are undone in reverse order
The function that `app.mount(a, b, ...)` returns SHALL unmount the modules that this call mounted, last mounted first. `app.unmount(a, b, ...)` SHALL unmount its modules in reverse order of the arguments. A module that was mounted before the call, or is already unmounted, SHALL be left as it is.

#### Scenario: Undo what the call mounted
- **WHEN** `b` was mounted earlier and `const stop = app.mount(a, b, c)` is called, then `stop()`
- **THEN** `c` and then `a` are unmounted and `b` stays mounted

#### Scenario: Unmount several
- **WHEN** `app.unmount(a, b)` is called while both are mounted
- **THEN** `b` is unmounted first and then `a`

### Requirement: Mounting several modules is all or nothing
If the `setup` of one of the modules throws, the modules of the same call that were already mounted SHALL be unmounted, in reverse order, and the error SHALL be thrown from the call. The module whose `setup` threw is undone as for a single mount.

#### Scenario: One setup fails
- **WHEN** `app.mount(a, b, c)` is called and the `setup` of `b` throws
- **THEN** `a` is unmounted, `c` is never mounted, the error is thrown, and none of the three is mounted

### Requirement: Edge cases of several modules
A call with no module SHALL do nothing and return a function that does nothing. A disposed app SHALL refuse `mount` with several modules as with one. A module whose name is taken by another mounted module SHALL replace it, as a single module does.

#### Scenario: No module
- **WHEN** `app.mount()` is called
- **THEN** nothing is mounted and the returned function does nothing

#### Scenario: Disposed app
- **WHEN** the app is disposed and `app.mount(a, b)` is called
- **THEN** the call fails as `app.mount(a)` does

#### Scenario: Replace by name
- **WHEN** a module named `user` is mounted and `app.mount(newUser)` is called with another module named `user`
- **THEN** the old one is unmounted and `newUser` is mounted
