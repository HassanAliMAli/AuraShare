# AuraShare — Project Intelligence Rules

> **AI Agent Contract**: These rules are the ground truth for all contributors, human or AI. Every decision traces back here. No exceptions unless explicitly documented with rationale.

---

## 0. Project Identity

**AuraShare** is a peer-to-peer file-sharing application with a distinctive "Liquid Cloud" aesthetic. It is not a generic app. It is not a portfolio piece. It competes on experience. The visual design is a first-class product feature — not decoration.

| Dimension | Value |
|---|---|
| Name | AuraShare |
| Purpose | Peer-to-peer file sharing with ambient, organic UI |
| Audience | Tech-forward users who appreciate craft |
| Aesthetic | Liquid Cloud — morphing SVG blobs, twilight depth, organic motion |
| Quality bar | Linear, Vercel, Stripe — then exceed them |

---

## 1. Stack & Versions (Frozen)

Never upgrade a pinned dependency without explicit user approval and a migration plan.

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | React | 19.x | Use new React 19 APIs (use(), useOptimistic, useTransition v2) |
| Language | TypeScript | 5.x | Strict mode always on |
| Build | Vite | 8.x | No CRA, no Next.js unless explicitly migrated |
| Styling | Tailwind CSS | 4.0 | Via `@tailwindcss/vite` plugin — use `@theme` not config.js |
| Animation | Framer Motion | 12.x | For orchestrated motion; use CSS for simple transitions |
| P2P | PeerJS | latest | Core feature — never mock in production |
| Utilities | clsx + tailwind-merge | latest | Always use `cn()` for conditional classes |
| Linting | ESLint + TypeScript ESLint | project config | Must pass on every commit |

### Strictly Forbidden Additions

Do not add these without explicit approval:
- Redux, Zustand, MobX, Jotai (use React 19 built-ins first)
- CSS-in-JS (styled-components, emotion — Tailwind is the system)
- Lodash (use native ES2024+)
- Moment.js (use `Intl` or `date-fns` if needed)
- jQuery (obviously)
- Any UI component library that overrides the aesthetic (MUI, Chakra, shadcn default themes)

---

## 2. Architecture Rules

### 2.1 File & Directory Structure

```
src/
├── components/          # UI components only — no business logic
│   ├── ui/              # Primitive components (Button, Badge, etc.)
│   ├── features/        # Feature-specific composites (FileCard, PeerStatus)
│   └── layout/          # Layout shells (Shell, Sidebar, etc.)
├── hooks/               # Custom React hooks — single responsibility
├── lib/                 # Pure utilities (no React imports)
│   ├── utils.ts         # cn() and generic helpers
│   ├── peer.ts          # PeerJS abstraction layer
│   └── transfer.ts      # File transfer logic
├── stores/              # React Context + useReducer stores (if state grows)
├── types/               # Shared TypeScript interfaces and types
├── App.tsx              # Root component — routing and providers only
├── main.tsx             # Entry point — DO NOT add logic here
└── index.css            # Tailwind v4 imports + design tokens only
```

**Rules:**
- `components/` files must be co-located with their styles and tests: `Button/Button.tsx`, `Button/Button.test.tsx`
- No file exceeds 300 lines. If it does, split it by responsibility.
- `App.tsx` is currently 22KB — it MUST be refactored into feature components before adding new features
- `lib/` contains zero React imports. If you need React, it belongs in `hooks/`
- Every new directory gets an `index.ts` barrel file for clean imports

### 2.2 Component Rules

```tsx
// ✅ CORRECT — functional component with typed props
interface FileCardProps {
  file: TransferFile;
  progress: number;
  onCancel: () => void;
}

export function FileCard({ file, progress, onCancel }: FileCardProps) {
  // hooks first
  // derived state second
  // handlers third
  // render last
}

// ❌ WRONG — default exports, untyped props, class components
export default function FileCard(props: any) {}
```

- Named exports only — never `export default`
- Props interfaces are always named `{ComponentName}Props`
- Component files match their exported name exactly: `FileCard.tsx` exports `FileCard`
- No inline functions as event handlers in JSX — define them in the component body
- `useCallback` and `useMemo` only when profiler identifies a problem — premature optimization is a bug

### 2.3 TypeScript Rules

```typescript
// ✅ Strict types always
type PeerStatus = "connecting" | "connected" | "disconnected" | "error";
type TransferFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  status: "pending" | "transferring" | "complete" | "failed";
  progress: number;
};

// ❌ Never
const peer: any = new Peer();
const files = [];
function handle(e) {}
```

- `strict: true` in all tsconfig files — always
- No `any` — use `unknown` + type guards when type is genuinely unknown
- No `@ts-ignore` — fix the type error or add a documented `@ts-expect-error` with reason
- Prefer `type` over `interface` for data shapes; `interface` for extensible contracts
- Discriminated unions for state machines (transfer status, peer connection state)
- Never assert types with `as` unless after a type guard — document why if unavoidable

### 2.4 State Management

Use the minimal state solution that solves the problem:

| Scope | Solution |
|---|---|
| Component-local UI state | `useState` |
| Derived values | `useMemo` (only if expensive) |
| Side effects | `useEffect` with cleanup |
| Async data / pending state | `useTransition` + `use()` (React 19) |
| Cross-component shared state | `useContext` + `useReducer` |
| Global app state (if needed) | Single Context with typed reducer |
| Server state / caching | React 19 cache() + use() |

**State anti-patterns (forbidden):**
- Storing derived values in state (compute them instead)
- `useEffect` for state synchronization (use events or derived state)
- Prop drilling deeper than 3 levels (use Context)
- Storing the same data in multiple state slices

---

## 3. Design System

### 3.1 The Aesthetic Contract

The "Liquid Cloud" aesthetic is non-negotiable. Every component must cohere with it.

**Core visual language:**
- **Background**: `#0c0c0e` twilight base — deep, near-black with blue-black undertone
- **Surfaces**: Layered translucent panels, not flat cards
- **Motion**: Organic, morphing — blobs, flows, dissolves. Nothing snaps. Nothing teleports.
- **Typography**: Clarity over decoration — legible on dark, never competing with motion
- **Color moments**: Restrained. The UI is mostly dark neutral. Color is signal, not wallpaper.

**What AuraShare is NOT:**
- Not clinical minimalism (no bare white surfaces with black text)
- Not rigid bento grids (use organic layout breaks)
- Not neon/cyberpunk (no electric green/pink accents unless contextually justified)
- Not gradient-text-as-a-trend
- Not AI-slop (no purple-to-blue hero gradients, no icon-in-a-circle feature grids)

### 3.2 Tailwind v4 Token System

All design tokens live in `src/index.css` under `@theme`. Never hardcode values.

```css
/* src/index.css */
@import "tailwindcss";

@theme {
  /* Twilight surface system */
  --color-void: #0c0c0e;           /* Base background */
  --color-aura-1: #111115;         /* Surface layer 1 */
  --color-aura-2: #16161c;         /* Surface layer 2 */
  --color-aura-3: #1c1c24;         /* Surface layer 3 */
  --color-aura-edge: #2a2a38;      /* Border/divider */

  /* Text hierarchy */
  --color-text-primary: #e8e8f0;   /* Primary content */
  --color-text-secondary: #9090a8; /* Secondary / muted */
  --color-text-ghost: #50505e;     /* Decorative / disabled */

  /* Accent system — used sparingly */
  --color-signal: #6c7cf8;         /* Primary action / active states */
  --color-signal-dim: #3d4a9a;     /* Hover predecessor */
  --color-transfer: #22d3a8;       /* Success / complete transfer */
  --color-warn: #f59e0b;           /* Warning / attention */
  --color-error: #ef4444;          /* Error state */

  /* Blur and glow variables */
  --glow-signal: 0 0 20px oklch(from #6c7cf8 l c h / 0.3);
  --glow-transfer: 0 0 20px oklch(from #22d3a8 l c h / 0.25);

  /* Spacing — 4px base unit */
  --space-px: 1px;
  --space-0: 0;
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */

  /* Fluid typography */
  --text-xs:   clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);
  --text-sm:   clamp(0.875rem, 0.8rem + 0.35vw, 1rem);
  --text-base: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);
  --text-lg:   clamp(1.125rem, 1rem + 0.75vw, 1.5rem);
  --text-xl:   clamp(1.5rem, 1.2rem + 1.25vw, 2.25rem);
  --text-2xl:  clamp(2rem, 1.2rem + 2.5vw, 3.5rem);

  /* Radius */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-2xl: 1.5rem;
  --radius-blob: 60% 40% 30% 70% / 60% 30% 70% 40%; /* Organic */
  --radius-full: 9999px;

  /* Typography */
  --font-display: 'Syne', 'Space Grotesk', sans-serif;
  --font-body: 'Inter', 'system-ui', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Animation timing */
  --ease-organic: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-snap: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-blob: cubic-bezier(0.45, 0.05, 0.55, 0.95);
  --duration-instant: 80ms;
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;
  --duration-blob: 8000ms;
}
```

### 3.3 The `cn()` Utility

Always use `cn()` for conditional class composition. Never string concatenation.

```typescript
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ✅ Usage
<div className={cn(
  "rounded-lg bg-aura-2 border border-aura-edge",
  isActive && "border-signal shadow-signal",
  variant === "ghost" && "bg-transparent border-transparent",
  className
)} />

// ❌ Never
<div className={`rounded-lg ${isActive ? "border-signal" : "border-aura-edge"}`} />
```

---

## 4. Motion & Animation Rules

Motion is a first-class feature of AuraShare. It must be intentional, performant, and accessible.

### 4.1 When to Use What

| Use case | Solution |
|---|---|
| Simple hover/focus transitions | CSS `transition` only |
| Entry/exit animations | Framer Motion `AnimatePresence` |
| Complex orchestrated sequences | Framer Motion `useAnimate` |
| Blob morphing (SVG) | Framer Motion `animate` on `d` attribute |
| Scroll-driven reveals | CSS Scroll-driven animations or Framer `whileInView` |
| Physics-based interactions | Framer Motion `useSpring` |
| Loop animations (background blobs) | CSS `@keyframes` — cheaper than JS |

### 4.2 Framer Motion Conventions

```tsx
// ✅ Correct — define variants outside component
const cardVariants = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  visible: {
    opacity: 1, y: 0, filter: "blur(0px)",
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] }
  },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } }
};

// ✅ AnimatePresence for conditional renders
<AnimatePresence mode="wait">
  {isVisible && (
    <motion.div key="card" variants={cardVariants} initial="hidden" animate="visible" exit="exit">
      {/* content */}
    </motion.div>
  )}
</AnimatePresence>

// ❌ Never — inline variant objects in JSX (recreated every render)
<motion.div animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 20 }} />
```

### 4.3 Animation Performance Rules

- **Only animate**: `opacity`, `transform` (translate, scale, rotate), `filter` (blur). These are GPU-composited.
- **Never animate**: `width`, `height`, `padding`, `margin`, `top`, `left`, `border-radius` values individually. Use `transform: scale()` for size, `clipPath` for reveal.
- **Always define `will-change: transform`** on elements with persistent animations (background blobs only — not every animated element)
- **`prefers-reduced-motion` is mandatory:**

```tsx
// src/hooks/useReducedMotion.ts
import { useReducedMotion } from "framer-motion";

// Then in components:
const prefersReduced = useReducedMotion();
const blobVariants = prefersReduced
  ? {} // static fallback
  : { animate: { borderRadius: ["60% 40% 30% 70%", "30% 60% 70% 40%"] } };
```

### 4.4 The Golden Animation Easing Curve

Use `[0.16, 1, 0.3, 1]` (fast-out, smooth-in) as the default for all UI transitions. This is the easing curve of refined products (Linear, Vercel, Framer).

- **Entry**: `duration: 0.3-0.5s`, ease `[0.16, 1, 0.3, 1]`
- **Exit**: `duration: 0.15-0.2s`, ease `[0.4, 0, 1, 1]` (fast exit)
- **Hover**: CSS `transition: 150ms ease`
- **Blob morphing**: `duration: 8-12s`, `repeat: Infinity`, `ease: "easeInOut"`

---

## 5. PeerJS & P2P Architecture

### 5.1 The Real Implementation Goal

The current `setTimeout`/`setInterval` mocks are development scaffolding ONLY. The production path:

```
Browser A (Initiator)
  → new Peer(peerId, { host: 'peerjs-server', port: 9000 })
  → peer.connect(remotePeerId)
  → connection.send(fileChunk)

Browser B (Receiver)
  → peer.on('connection', (conn) => { conn.on('data', ...) })
  → Reassemble chunks → File download
```

### 5.2 Peer Abstraction Layer

All PeerJS logic lives in `src/lib/peer.ts`. Components never import PeerJS directly.

```typescript
// src/lib/peer.ts — the ONLY file that imports PeerJS
import Peer, { type DataConnection } from "peerjs";

export type PeerConnectionState =
  | { status: "idle" }
  | { status: "initializing" }
  | { status: "ready"; peerId: string }
  | { status: "connecting"; targetId: string }
  | { status: "connected"; connection: DataConnection; targetId: string }
  | { status: "error"; error: Error };

export type TransferState =
  | { type: "idle" }
  | { type: "sending"; fileName: string; progress: number; bytesTransferred: number; totalBytes: number }
  | { type: "receiving"; fileName: string; progress: number; bytesReceived: number; totalBytes: number }
  | { type: "complete"; fileName: string; url: string }
  | { type: "failed"; error: Error };
```

### 5.3 Mock vs. Real Logic

```typescript
// src/lib/peer.ts
const IS_MOCK = import.meta.env.VITE_MOCK_PEER === "true";

// All mock logic is feature-flagged — never mixed with real logic
export async function initPeer(): Promise<string> {
  if (IS_MOCK) return mockInitPeer();
  return realInitPeer();
}
```

- Mock logic: `VITE_MOCK_PEER=true npm run dev`
- Production: `VITE_MOCK_PEER=false npm run build`
- Never ship mock logic to production builds

---

## 6. Code Quality Standards

### 6.1 Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Components | PascalCase | `FileDropzone`, `PeerStatusBadge` |
| Hooks | camelCase with `use` prefix | `useDiscovery`, `useTransferProgress` |
| Utilities | camelCase | `formatBytes`, `generatePeerId` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_FILE_SIZE`, `CHUNK_SIZE_BYTES` |
| Types/Interfaces | PascalCase | `TransferFile`, `PeerConnectionState` |
| CSS variables | kebab-case with `--` | `--color-signal`, `--duration-blob` |
| Event handlers | camelCase with `on` prefix | `onFileSelect`, `onTransferComplete` |
| Boolean variables | `is`/`has`/`can` prefix | `isConnected`, `hasFiles`, `canTransfer` |

### 6.2 Error Handling

```typescript
// ✅ Typed errors with context
class PeerConnectionError extends Error {
  constructor(
    message: string,
    public readonly peerId: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "PeerConnectionError";
  }
}

// ✅ Result type for operations that can fail
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

// ✅ Error boundaries for component trees
// Use react-error-boundary — wrap all major feature sections

// ❌ Never silent failures
try { doSomething(); } catch (e) {} // swallowing errors
// ❌ Never console.error only — surface errors to the user
```

### 6.3 Performance Patterns

```tsx
// ✅ Virtualize long lists (files list)
import { useVirtualizer } from "@tanstack/react-virtual"; // only if list > 100 items

// ✅ Memoize expensive computations
const sortedFiles = useMemo(
  () => files.sort((a, b) => b.addedAt - a.addedAt),
  [files]
);

// ✅ Stable callbacks passed to children
const handleFileSelect = useCallback((files: File[]) => {
  dispatch({ type: "ADD_FILES", payload: files });
}, [dispatch]);

// ✅ Web Workers for file chunking (don't block the main thread)
// src/workers/chunker.worker.ts — file slicing/hashing logic
```

### 6.4 Accessibility Non-Negotiables

- Every interactive element has a visible focus ring (Tailwind: `focus-visible:ring-2 focus-visible:ring-signal`)
- Every `<button>` that is icon-only has `aria-label`
- Drag-and-drop (`AuraDropzone`) has keyboard alternative (click to open file dialog)
- Transfer progress communicates to screen readers: `aria-live="polite"` on progress updates
- Color is never the ONLY indicator of state — always pair with text or icon
- WCAG AA contrast: `--color-text-primary` on `--color-void` must meet 4.5:1 minimum

---

## 7. Current Technical Debt (Prioritized)

These are known issues. Do not add features on top of unresolved debt without marking the new code `TODO: [debt-id]`.

| ID | Issue | Location | Priority |
|---|---|---|---|
| TD-001 | App.tsx is 22KB — needs decomposition | `src/App.tsx` | 🔴 Critical |
| TD-002 | All discovery logic is mocked | `src/hooks/useDiscovery.ts` | 🟡 High |
| TD-003 | All file transfer is mocked | `src/App.tsx` (scattered) | 🟡 High |
| TD-004 | No test framework configured | project root | 🟠 Medium |
| TD-005 | No error boundaries | `src/App.tsx` | 🟠 Medium |
| TD-006 | No Web Worker for file processing | `src/lib/` | 🟠 Medium |
| TD-007 | No bundle size analysis | `vite.config.ts` | 🟢 Low |

**Rule**: New features require a linked debt ID comment if they depend on mocked behavior:
```typescript
// TODO(TD-002): Replace mock discovery with real PeerJS peer listing
const peers = await mockDiscoverPeers();
```

---

## 8. Testing Standards

> **Current state**: No test framework. Adding tests is TD-004. When tests are added:

```
src/
├── components/
│   └── FileCard/
│       ├── FileCard.tsx
│       └── FileCard.test.tsx    # Co-located unit tests
├── hooks/
│   └── useDiscovery.test.ts     # Hook tests with renderHook
├── lib/
│   └── peer.test.ts             # Pure function unit tests
└── __tests__/
    └── e2e/                     # Playwright E2E tests
```

**When tests are added, the required test framework is:**
- Unit/integration: Vitest + React Testing Library
- E2E: Playwright
- Coverage threshold: 80% for `src/lib/`, 60% for `src/hooks/`

**Test philosophy**: Test behavior, not implementation. Test the contract (what the function does), not the internals (how it does it).

---

## 9. Commands Reference

```bash
# Development
npm run dev                          # Vite dev server with HMR
VITE_MOCK_PEER=true npm run dev      # Dev with mock P2P (default)
VITE_MOCK_PEER=false npm run dev     # Dev against real PeerJS server

# Quality
npm run lint                         # ESLint check — MUST pass before commit
npm run build                        # TypeScript check + Vite production build
npm run preview                      # Preview production bundle locally

# When tests are added
npm run test                         # Vitest unit tests
npm run test:e2e                     # Playwright E2E
npm run test:coverage                # Coverage report

# Bundle analysis (add to package.json when needed)
npm run build -- --analyze           # With vite-bundle-visualizer
```

---

## 10. Git & Commit Standards

### Commit Message Format (Conventional Commits)

```
<type>(<scope>): <short description>

[optional body]

[optional footer: BREAKING CHANGE, closes #issue]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code change without feature or fix
- `style`: Formatting, Tailwind class changes
- `motion`: Animation or transition changes
- `perf`: Performance improvement
- `a11y`: Accessibility improvement
- `types`: TypeScript-only changes
- `chore`: Build, config, dependency updates
- `docs`: Documentation only

**Examples:**
```
feat(transfer): implement real PeerJS file chunking

Replaces TD-002 mock with actual DataConnection.send() chunked transfer.
Chunks are 64KB, tracked via progress events. Web Worker handles slicing.

Closes #12

refactor(app): decompose App.tsx into feature components

Addresses TD-001. Extracts FileTransferView, PeerDiscoveryPanel,
and ConnectionStatus into src/components/features/.
```

**Rules:**
- Never commit directly to `main` — all changes via PR
- Never commit with failing lint or TypeScript errors
- Breaking changes require `BREAKING CHANGE:` footer

---

## 11. Environment Variables

```bash
# .env.development
VITE_MOCK_PEER=true
VITE_PEER_SERVER_HOST=localhost
VITE_PEER_SERVER_PORT=9000
VITE_PEER_SERVER_PATH=/peerjs

# .env.production
VITE_MOCK_PEER=false
VITE_PEER_SERVER_HOST=<your-peerjs-server>
VITE_PEER_SERVER_PORT=443
VITE_PEER_SERVER_PATH=/peerjs
```

**Rules:**
- Never commit `.env.production` to git
- All `VITE_` prefixed variables are public — never store secrets in them
- Access via `import.meta.env.VITE_*` — never `process.env`

---

## 12. Security & File Handling Rules

File transfer is security-critical. Apply these rules without exception:

```typescript
// ✅ Always validate file before accepting/sending
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/", "application/", "text/"];

function validateFile(file: File): Result<File, ValidationError> {
  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: new ValidationError("File too large", { maxSize: MAX_FILE_SIZE }) };
  }
  // ... further validation
}

// ✅ Sanitize filenames before creating download links
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\-\s]/g, "_").substring(0, 255);
}

// ✅ Use Object URLs for downloads — release them after use
const url = URL.createObjectURL(blob);
link.href = url;
link.click();
setTimeout(() => URL.revokeObjectURL(url), 1000);
```

- Never execute received file content (no `eval`, no dynamic `<script>` injection)
- Chunk size for transfers: 64KB per chunk (PeerJS default is 16KB — increase for performance)
- Hash files before sending (SHA-256 via SubtleCrypto) — verify on receive
- Rate-limit connection attempts to prevent abuse

---

## 13. Vite Configuration Standards

```typescript
// vite.config.ts — required configuration
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@hooks": path.resolve(__dirname, "./src/hooks"),
      "@lib": path.resolve(__dirname, "./src/lib"),
      "@types": path.resolve(__dirname, "./src/types"),
    },
  },
  build: {
    target: "es2022",
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "motion": ["framer-motion"],
          "peer": ["peerjs"],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

---

## 14. The "Is It Ship-Ready?" Checklist

Run this before every PR merge:

### Code Quality
- [ ] `npm run lint` passes with zero warnings
- [ ] `npm run build` compiles without TypeScript errors
- [ ] No `console.log` statements (only `console.warn`/`console.error` with context)
- [ ] No `TODO` comments without a linked debt ID (format: `TODO(TD-XXX)`)
- [ ] No `any` types added

### Visual Quality
- [ ] New components use only tokens from `@theme` — no hardcoded values
- [ ] `cn()` used for all conditional classes
- [ ] Hover/focus states are present on all interactive elements
- [ ] `aria-label` on all icon-only buttons
- [ ] Animations respect `prefers-reduced-motion`
- [ ] The component coheres with the Liquid Cloud aesthetic

### Architecture
- [ ] No component exceeds 300 lines
- [ ] No new direct PeerJS imports outside `src/lib/peer.ts`
- [ ] New hooks are single-responsibility
- [ ] New utility functions in `src/lib/` have no React imports

### Performance
- [ ] No new synchronous operations on large files (use Web Workers)
- [ ] No new `useEffect` for state synchronization
- [ ] `AnimatePresence` wraps all conditional renders with exit animations

---

## 15. AI Agent Instructions

When an AI agent (Claude, Cursor, Copilot, etc.) is editing this codebase:

1. **Read this file in full before making any changes**
2. **Check TD-001 first** — if asked to add a feature that requires `App.tsx`, refactor the relevant section out first
3. **Never remove mock flags** — mock code is preserved behind `VITE_MOCK_PEER` feature flags
4. **Respect the aesthetic** — if a component doesn't match the Liquid Cloud aesthetic, flag it before committing
5. **Follow the debt register** — if your change addresses a debt item, update the status in this file
6. **Ask before adding dependencies** — new `npm install` commands require justification against the forbidden list
7. **The type system is load-bearing** — TypeScript errors are bugs, not inconveniences
8. **Motion is a feature** — do not remove animations to "simplify" code; find the real underlying issue
9. **When in doubt, don't** — a missing feature is better than a broken aesthetic

---

*Last updated: project init. Update this file when architecture, conventions, or debt registry changes.*
