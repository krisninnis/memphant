const sharp = require("sharp");
const path = require("path");

const input = path.join(__dirname, "../public/icons/source-elephant-1024.png");
const legacySizes = [16, 32, 48, 72, 96, 128, 144, 192, 256, 512];
const paddedSizes = [180, 192, 512];
const background = "#1a1a2e";

async function generateLegacyIcons() {
  for (const size of legacySizes) {
    await sharp(input)
      .resize(size, size)
      .png()
      .toFile(`public/icons/icon-${size}.png`);

    console.log(`legacy icon-${size}.png`);
  }
}

async function generatePaddedIcon(size, outputName, scale = 0.72) {
  const iconSize = Math.round(size * scale);
  const offset = Math.round((size - iconSize) / 2);

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([
      {
        input: await sharp(input).resize(iconSize, iconSize).png().toBuffer(),
        top: offset,
        left: offset,
      },
    ])
    .png()
    .toFile(outputName);

  console.log(`padded ${path.basename(outputName)}`);
}

(async () => {
  await generateLegacyIcons();

  for (const size of paddedSizes) {
    await generatePaddedIcon(size, `public/icons/icon-${size}-v2.png`, 0.72);
    await generatePaddedIcon(size, `public/icons/icon-${size}-maskable-v2.png`, 0.62);
  }

  console.log("DONE");
})();
