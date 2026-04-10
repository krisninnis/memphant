const sharp = require("sharp");
const path = require("path");

const input = path.join(__dirname, "../public/icons/source-elephant-1024.png");

const sizes = [16, 32, 48, 72, 96, 128, 144, 192, 256, 512];

(async () => {
  for (const size of sizes) {
    await sharp(input)
      .resize(size, size)
      .png()
      .toFile(`public/icons/icon-${size}.png`);

    console.log(`✓ icon-${size}.png`);
  }

  console.log("DONE");
})();