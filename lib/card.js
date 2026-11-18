// Link-preview card (1200x630, the size X and most sites show as a large image) for a project:
// the artwork on the left, the name, description and price on the right, in the label's style.
import { Resvg } from '@resvg/resvg-js';

const BLACK = '#0B0B0C';
const WHITE = '#F2F0EB';
const DIM = '#8A8782';
const RED = '#E8202A';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Greedy word wrap for a monospace font. */
function wrap(text, width) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if (line && (line + ' ' + word).length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function cardPng(project, artSvg) {
  // The artworks are 480x540; drawn 490 tall they are about 436 wide. Rasterised first, because text
  // inside an SVG nested as an <image> does not get the system fonts.
  const art = new Resvg(artSvg, { fitTo: { mode: 'width', value: 872 }, font: { loadSystemFonts: true } }).render().asPng().toString('base64');
  const desc = wrap(project.description, 30).slice(0, 5);
  const price = project.priceUsd ? `from about $${project.priceUsd}` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="${BLACK}"/>
<image href="data:image/png;base64,${art}" x="70" y="70" width="436" height="490"/>\n<rect x="70.5" y="70.5" width="435" height="489" fill="none" stroke="#2C2F38"/>
<g font-family="DejaVu Sans Mono" fill="${WHITE}">
  <text x="580" y="150" font-size="50" font-weight="700">${esc(project.name)}</text>
  ${desc.map((l, i) => `<text x="580" y="${220 + i * 40}" font-size="26" fill="${DIM}">${esc(l)}</text>`).join('')}
  <text x="580" y="500" font-size="28">${esc(price)}</text>
  <text x="580" y="555" font-size="24" fill="${DIM}">okonomi press</text>
</g>
<rect x="776" y="535" width="13" height="24" fill="${RED}"/>
</svg>`;
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, font: { loadSystemFonts: true } }).render().asPng();
}
