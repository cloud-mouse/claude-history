// 从 icon-source.svg 矢量渲染各平台图标。
// 用法：npm i --no-save sharp && node build/gen-icons.js
// 矢量直接渲染，不经过浏览器截图，杜绝底部裁切。
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const build = __dirname;
const svg = fs.readFileSync(path.join(build, 'icon-source.svg'));

async function render(size, file) {
  await sharp(svg, { density: 300 })
    .resize(size, size, { fit: 'fill' })
    .png()
    .toFile(file);
}

(async () => {
  for (const s of [16, 32, 64, 128, 256, 512]) {
    await render(s, path.join(build, `icon.${s}x${s}.png`));
    console.log('  icon.' + s + 'x' + s + '.png');
  }
  const iset = path.join(build, 'icon.iconset');
  fs.rmSync(iset, { recursive: true, force: true });
  fs.mkdirSync(iset, { recursive: true });
  const entries = [
    ['icon_16x16.png', 16], ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32], ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128], ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256], ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512], ['icon_512x512@2x.png', 1024],
  ];
  for (const [name, size] of entries) {
    await render(size, path.join(iset, name));
  }
  execSync(`iconutil -c icns "${iset}" -o "${path.join(build, 'icon.icns')}"`);
  fs.rmSync(iset, { recursive: true, force: true });
  console.log('  icon.icns');
  console.log('done');
})();
