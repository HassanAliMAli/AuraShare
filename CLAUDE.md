# Project Instructions

## Tech Stack
- Frontend: Vanilla HTML/JS with Tailwind CSS (CDN)
- Icons: Font Awesome
- Fonts: Inter, Space Grotesk (Google Fonts)

## Code Style
- Use camelCase for JavaScript functions and variables.
- Use Tailwind CSS for styling; avoid adding more embedded CSS unless necessary.
- Maintain the single-file structure for now, or suggest a refactor to a proper build system if complexity increases.

## Build & Run
- This is a static project. Open `index.html` directly in a browser to run.
- No build or lint commands currently configured.

## Project Structure
- `index.html`: Main application entry point, containing all logic and styles.

## Conventions
- **Mock Logic**: Most functionality is currently simulated. Future real implementations should use WebRTC for P2P sharing as hinted in the UI.
- **Error Handling**: Currently minimal due to mock nature. Implement Zod validation if moving to a backend-backed system.
