// Generate resources/icon.icns and resources/icon.ico from resources/icon.png
import fs from 'node:fs';
import path from 'node:path';
import png2icons from 'png2icons';

const root = process.cwd();
const srcPng = path.join(root, 'resources', 'icon.png');
const outIcns = path.join(root, 'resources', 'icon.icns');
const outIco = path.join(root, 'resources', 'icon.ico');

if (!fs.existsSync(srcPng)) {
  console.log('[icons] resources/icon.png not found; skipping icon generation');
  process.exit(0);
}

const input = fs.readFileSync(srcPng);

// ICNS (auto resize, removeAlpha=false preserves rounded corners on macOS)
const icns = png2icons.createICNS(input, png2icons.BILINEAR, /*removeAlpha*/ false, /*icnsType*/ 0);
if (icns && icns.length > 0) {
  fs.writeFileSync(outIcns, icns);
  console.log('[icons] Wrote', outIcns);
} else {
  console.error('[icons] Failed to create ICNS');
}

// ICO
const ico = png2icons.createICO(input, png2icons.BILINEAR, /*removeAlpha*/ false, /*sizes*/ [16,24,32,48,64,128,256]);
if (ico && ico.length > 0) {
  fs.writeFileSync(outIco, ico);
  console.log('[icons] Wrote', outIco);
} else {
  console.error('[icons] Failed to create ICO');
}
