// Dibuja el boletín de ejemplo (boletin.html) como imagen, para simular un documento escaneado
import { pathToFileURL } from 'url';
import { loadPlaywright } from './playwright.mjs';

const [src, out] = process.argv.slice(2);
const { chromium } = await loadPlaywright();
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 800, height: 1130 }, deviceScaleFactor: 1.4 });
await p.goto(pathToFileURL(src).href);
await p.screenshot({ path: out });
await b.close();
