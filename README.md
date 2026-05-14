# Tubes3 Stosa

## Compile and Run

Install the dependencies:

```bash
npm install
```

## Run in Development

```bash
npm run dev
```

Open the popup page in a browser:

```text
http://localhost:5173/popup.html
```

This runs the popup through the Vite development server.

## Compile the Extension

```bash
npm run build
```

The compiled Chrome extension files will be generated in:

```text
dist/
```

## Run in Chrome

After compiling:

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the generated `dist/` folder.
6. Click the extension icon to open the popup.
