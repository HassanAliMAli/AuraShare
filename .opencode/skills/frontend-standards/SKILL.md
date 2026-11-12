---
name: frontend-standards
description: Professional, modular, non-generic frontend rules plus the AI-slop list to avoid. Use for any UI work.
---
## Layout
- All UI code, configs and assets live in frontend/. Docs go in docs/. Never put code, notes, logs or scratch files in the project root.

## Current information
- Never rely on memory for libraries, APIs, versions or syntax. Search with the Brave Search MCP first, prefer official docs, and check the date and version.
- At the start of a task, list the available MCP tools and use the best fit for each operation (docs tool for library docs, browser tool for checking the UI). If a useful tool is missing, say so.

## Be professional and modular
- Organize by feature, with shared pieces in one shared place (components, hooks, utils, design tokens).
- Before writing anything, search frontend/ for an existing component, hook, style or util that does the job. Reuse or extend it. Never duplicate. Anything used twice becomes a shared module.
- Components stay small, single-purpose and typed.
- All colors, fonts, spacing, radii and shadows come from one set of design tokens. No hardcoded values scattered in components.
- Accessible by default: semantic HTML, labels, focus states, contrast, keyboard use. Responsive from phone to desktop. Inputs 16px or larger.
- Handle loading, empty and error states. Use real content: no lorem ipsum, fake stats, fake testimonials or placeholder logos.
- No unused code or files.

## AI slop to avoid (tells of generic AI-built UI)
Typography
- Inter, Roboto, Arial or system fonts as the display face. Also avoid reflex picks (Space Grotesk, Geist, Instrument Serif) unless chosen on purpose.
- A serif italic on one accent word in the headline.
- No type scale: random sizes and weights.
Color and effects
- Purple, indigo or blue-to-purple gradients (hero, buttons, logo, headline text).
- Neon glow, glassmorphism or blur as decoration. Pure #000, oversaturated accents, timid evenly weighted palettes.
- The same big shadow and giant border radius on every element.
- A thick colored border on one side of a rounded card.
Layout and components
- Centered hero with headline, subtitle and two buttons.
- Three equal rounded feature cards in a row, each with an icon.
- Three-tier pricing with a highlighted "Most Popular" card.
- Emoji or stock icons used as decoration. "Live" badges and pulsing dots with no meaning.
- Everything centered and equally spaced, with no hierarchy.
Copy
- Hype filler: "Supercharge", "Seamless", "Unlock", "Revolutionize", "Elevate your workflow".

## Instead
Pick a clear visual direction before coding. Use two deliberately chosen typefaces, one accent color on a neutral base, a real spacing scale, and layouts that fit the actual content. If the design could belong to any of ten thousand products, redo it.
