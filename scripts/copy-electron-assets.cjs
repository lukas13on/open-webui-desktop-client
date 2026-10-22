const { copyFileSync, existsSync, mkdirSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assets = [['electron/webui-titlebar.html', 'dist-electron/webui-titlebar.html']];

mkdirSync(path.join(root, 'dist-electron'), { recursive: true });
for (const [from, to] of assets) {
  const source = path.join(root, from);
  if (!existsSync(source)) {
    console.error(`Missing Electron asset: ${from}`);
    process.exit(1);
  }
  copyFileSync(source, path.join(root, to));
}
console.log(`Copied ${assets.length} Electron asset(s) to dist-electron.`);
