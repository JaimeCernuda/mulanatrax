# GameTrax

Web-based mapper/notepad for screenshot-driven exploration games. The app name, game name, browser database, and screenshot presets are configurable for different games.

## Features

- Create empty map tiles, then load screenshots by drop, file picker, or clipboard paste
- Expand maps left, right, up, and down while visible labels relabel from the current top-left
- Keep original pasted/uploaded image data in IndexedDB instead of downscaling to lossy JPEG
- Toggle dark mode from the main toolbar
- Add notes and reference images to individual tiles
- Draw on tiles and drop preset markers for route notes, keys, warnings, and checks
- Download the composed map as a PNG with selectable labels, links, drawings, markers, and empty cells
- Optional OCR through your own Google Vision API key
- Search through notes and map tiles
- Mark tiles as unsolved and review them later
- Draw links between tiles for loops, portals, or route hints
- Store map data, original tile images, drawings, markers, settings, and notes locally in the browser through IndexedDB

## Local Development

Install Node.js 22+, then run:

```sh
npm install
npm run dev
```

Open http://localhost:5173.

Optional OCR setup:

```sh
cp .env.sample .env
```

Set `VITE_API_KEY` to a Google Vision API key.

## Configuration

Build-time configuration uses Vite env vars:

- `VITE_APP_NAME`: displayed app name
- `VITE_GAME_NAME`: game name available to runtime configuration
- `VITE_DB_NAME`: browser IndexedDB name. Use a stable value if you already have saved maps because browser data is keyed by this name.
- `VITE_SCREENSHOT_PRESETS`: JSON array of screenshot presets

Docker runtime configuration uses the same values with `GAMETRAX_` names:

- `GAMETRAX_APP_NAME`
- `GAMETRAX_GAME_NAME`
- `GAMETRAX_DB_NAME`
- `GAMETRAX_SCREENSHOT_PRESETS`
- `GAMETRAX_PORT`

Preset JSON shape:

```json
[
  {
    "id": 1,
    "label": "Full frame 16:9",
    "tileWidth": 320,
    "tileHeight": 180,
    "canvasWidth": 320,
    "canvasHeight": 180,
    "ocrCleanup": {
      "removeText": ["HUD label"],
      "trailingPattern": "\\nCONFIRM(.|\\s)*$"
    }
  }
]
```

The built-in default is `Auto detect`, which switches to a common full-frame 16:9 or 4:3 preset based on the first dropped image. Custom preset JSON can still define fixed crop rectangles when you need them for a specific capture workflow.

## Docker

Build and run locally:

```sh
docker compose up --build -d
```

The app is served on http://localhost:8080 by default. Set `GAMETRAX_PORT` to change the host port.

## Verification

```sh
npm run lint
npm test
npm run build
```
