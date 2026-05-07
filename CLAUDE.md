# AuraShare Project Instructions

## Tech Stack
- **Framework**: React 19 (TypeScript)
- **Build Tool**: Vite 8
- **Styling**: Tailwind CSS 4.0 (Vite Plugin)
- **Animation**: Framer Motion 12
- **Utilities**: clsx, tailwind-merge

## Code Style
- Use functional components and hooks.
- Use `cn()` utility for dynamic tailwind classes.
- Follow "Liquid Cloud" aesthetic: morphing SVG blobs, twilight background, organic motion.
- Avoid generic "AI-generated" UI tropes (no clinical minimalism, no rigid bento grids).

## Build & Run
- Dev: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`

## Project Structure
- `src/components/`: UI components (AuraDropzone, Constellation, CustomCursor).
- `src/hooks/`: Custom React hooks (useDiscovery).
- `src/lib/`: Shared utilities (utils.ts).
- `src/index.css`: Tailwind v4 imports and base styles.

## Conventions
- **Mock Logic**: Discovery and file transfers are currently simulated with `setTimeout` and `setInterval`.
- **Aesthetics**: Maintain the deep twilight background (#0c0c0e) and bioluminescent gradients.
