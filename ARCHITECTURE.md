# Architecture

Fillin is built on a strict, decoupled monorepo architecture enforcing extreme separation of concerns. The primary directive is that the Chrome Extension, Landing Page, and Backend must be able to deploy and run entirely independently.

## Local-First Philosophy
The extension is entirely local-first. It relies on standard browser APIs (e.g. `chrome.storage.local`) for persistence and uses no external databases or synchronization tools. This ensures absolute privacy and immediate performance.

## The `@fillin/shared` Constraints
The `packages/shared` workspace is the heart of our business logic. To ensure absolute portability, it strictly adheres to the following rules:
- **No Chrome APIs**: It must run natively in Node.js, JS DOM, or a Service Worker.
- **No DOM APIs**: It cannot reference `window`, `document`, or `HTMLElement`. All DOM manipulation is explicitly handled by the consumer applications.
- **No React**: It contains zero UI code.
- **No Server Code**: It does not contain Fastify instances, routing, or secrets.

## Independent Backend
The `landing/backend` is an optional Fastify service exposing only `GET /health`. Neither the extension nor the landing frontend requires it. It has no workspace runtime dependencies, uses a self-contained TypeScript configuration, and compiles to `dist/` for deployment with Node.js and production dependencies. See `apps/landing/backend/README.md` for deployment instructions.

## Shared Package Builds
`@fillin/shared` exports compiled ES modules and type declarations from `packages/shared/dist`. Turbo builds this package before dependent builds, tests, typechecks, and development servers. Production output excludes tests and contains no Chrome APIs, DOM code, React components, or server code.

## Snippet Writes
All snippet mutations acquire the same Web Lock before reading storage and release it after saving. This coordinates concurrent operations across extension pages on the same origin. Environments without Web Locks use an in-process queue shared by service instances. Imports and starter packs use the same lock as individual edits. Storage errors propagate to the caller and do not block later operations.

## Statistics and Blocked Websites
Chrome storage mutations for statistics and blocked websites are sent to the extension background worker. It serializes each read-modify-write operation by storage key, including the entire blocked-domain toggle. This provides one writer across content scripts on different website origins and extension windows; website-origin Web Locks alone would not coordinate these clients. The message response is sent after storage confirms the write. Failed requests never fall back to uncoordinated direct writes, and failed operations release the queue for later requests. The localStorage preview uses same-origin Web Locks with an in-process queue fallback.

## Known Limitations
- `<input type="password">`: Text expansion is deliberately disabled in password fields for security.
- `<input type="email">`, `type="number"`: Standard HTML5 forbids reading the cursor position (`selectionStart`). Fillin implements a robust, instantaneous workaround by temporarily switching these to `type="text"` internally, but highly customized shadow-DOM implementations of these inputs might still resist expansion on rare edge cases.
- **Mobile Devices**: Chrome extensions are fundamentally unsupported on mobile Chrome browsers, meaning this tool is desktop-only.

## Extension DOM Adapters
To support arbitrary websites, Fillin utilizes an `AdapterFactory` pattern that generates a unified interface over disparate input types:
1. `TextInputAdapter`: For standard `<input>` and `<textarea>` elements.
2. `ContentEditableAdapter`: For complex rich-text editors (Notion, Gmail) using `isContentEditable`.
