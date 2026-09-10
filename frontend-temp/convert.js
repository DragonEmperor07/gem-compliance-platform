const fs = require('fs');

const html = fs.readFileSync('trust-setu-landing.html', 'utf-8');

const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/);
const css = cssMatch ? cssMatch[1] : '';

const headerMatch = html.match(/<header class="nav">([\s\S]*?)<\/header>/);
const header = headerMatch ? `<header class="nav">${headerMatch[1]}</header>` : '';

const footerMatch = html.match(/<footer>([\s\S]*?)<\/footer>/);
const footer = footerMatch ? `<footer>${footerMatch[1]}</footer>` : '';

const mainMatch = html.match(/<main>([\s\S]*?)<\/main>/);
const main = mainMatch ? `<main>${mainMatch[1]}</main>` : '';

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
const script = scriptMatch ? `<script is:inline>${scriptMatch[1]}</script>` : '';

fs.mkdirSync('src/styles', { recursive: true });
fs.mkdirSync('src/layouts', { recursive: true });
fs.mkdirSync('src/components', { recursive: true });
fs.mkdirSync('src/pages', { recursive: true });

fs.writeFileSync('src/styles/global.css', css);

const layout = `---
import '../styles/global.css';
export interface Props {
    title: string;
}
const { title } = Astro.props;
---
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <meta name="description" content="Trust Setu connects to Udyam, GSTN, PAN, EPFO, MCA21 and DigiLocker to verify GeM bidder compliance automatically, giving procurement officers a single auditable record instead of eight open tabs.">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
    <slot />
</body>
</html>`;
fs.writeFileSync('src/layouts/Layout.astro', layout);

fs.writeFileSync('src/components/Header.astro', `---
---
${header}`);

fs.writeFileSync('src/components/Footer.astro', `---
---
${footer}`);

fs.writeFileSync('src/pages/index.astro', `---
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
---

<Layout title="Trust Setu — Verified bidder compliance for GeM procurement">
  <Header />
  ${main}
  <Footer />
  ${script}
</Layout>`);

if (!fs.existsSync('package.json')) {
    fs.writeFileSync('package.json', JSON.stringify({
        "name": "trust-setu",
        "type": "module",
        "version": "0.0.1",
        "scripts": {
            "dev": "astro dev",
            "start": "astro dev",
            "build": "astro build",
            "preview": "astro preview",
            "astro": "astro"
        },
        "dependencies": {
            "astro": "^4.14.0"
        }
    }, null, 2));
}
if (!fs.existsSync('astro.config.mjs')) {
    fs.writeFileSync('astro.config.mjs', `import { defineConfig } from 'astro/config';\\nexport default defineConfig({});`);
}
console.log('Conversion successful!');
