// Builds dist/valuation-tool.html: one self-contained file (styles + scripts inlined).
// Usage: node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('./src/styles.css');
const js = ['./src/engine.js', './src/sample.js', './src/app.js'].map(read).join('\n;\n');
const html = `<title>مُقيِّم الدخل</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Noto+Kufi+Arabic:wght@600;700&display=swap">
<style>
${css}
</style>
<div id="app" lang="ar" dir="rtl"></div>
<script>
document.documentElement.setAttribute('lang', 'ar');
document.documentElement.setAttribute('dir', 'rtl');
${js.replace(/<\/script/gi, '<\\/script')}
</script>
`;
mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/valuation-tool.html', import.meta.url), html);
console.log('dist/valuation-tool.html', (html.length / 1024).toFixed(1) + ' KB');
