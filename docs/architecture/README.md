# Architecture Docs

Please see the root [`ARCHITECTURE.md`](../../ARCHITECTURE.md) for the central architectural decisions, constraints, and philosophy guiding the Fillin repository.

## Components Breakdown
- `@fillin/extension`: Contains the DOM Adapters (Text, ContentEditable) and the Chrome Storage Repository.
- `@fillin/landing-frontend`: The visual marketing site and extension download, with no backend dependency.
- `@fillin/landing-backend`: The optional, standalone Fastify health API.
- `@fillin/shared`: The pure, framework-agnostic text detection engine.
