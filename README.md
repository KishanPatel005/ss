# Screenshot Server

This folder contains the backend Express server for handling screenshot requests using Puppeteer.

## Setup

1. **Install dependencies:**
   ```sh
   npm install
   ```

2. **Run the backend:**
   ```sh
   node index.js
   ```
   The server will start on port 3000 by default.

---

## API Endpoints

### 1. `GET /screenshot`
Take a screenshot of a single web page.

#### Query Parameters:
- `url` (required): The web URL to screenshot (must start with http:// or https://)
- `delay` (optional): Milliseconds to wait after page load before screenshot (e.g., 1000)
- `width` (optional): Viewport width in pixels (e.g., 1280)
- `height` (optional): Viewport height in pixels (e.g., 800)
- `fullPage` (optional): `true` or `false` (default: true) — whether to capture the full page or just the viewport

#### Example curl:
```sh
curl "http://localhost:3000/screenshot?url=https://example.com&delay=1000&width=1280&height=800&fullPage=false" --output screenshot.png
```

---

### 2. `GET /batch-screenshot`
Take screenshots of multiple web pages and return them as a zip file.

#### Query Parameters:
- `urls` (required): Comma-separated list of web URLs (e.g., `https://a.com,https://b.com`)

#### Example curl:
```sh
curl "http://localhost:3000/batch-screenshot?urls=https://example.com,https://github.com" --output screenshots.zip
```

---

## Notes
- The server also serves static files from the `../public` directory (the frontend client).
- Any unmatched route will return `public/index.html` (for SPA support).
- All screenshots are taken using Puppeteer in headless mode.
