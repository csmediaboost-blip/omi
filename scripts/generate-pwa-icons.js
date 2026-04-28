import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const logoPath = path.join(publicDir, 'logo-main.png');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
  console.log('[v0] Generating PWA icons from logo-main.png...');

  try {
    // Check if logo exists
    await fs.access(logoPath);
    console.log(`[v0] Found logo at ${logoPath}`);

    // Generate standard icons
    for (const size of sizes) {
      const outputPath = path.join(publicDir, `icon-${size}x${size}.png`);
      await sharp(logoPath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 3, g: 7, b: 18, alpha: 1 } // Match your background color
        })
        .png()
        .toFile(outputPath);
      console.log(`[v0] Generated icon-${size}x${size}.png`);
    }

    // Generate maskable icons (for adaptive icons on Android)
    const maskableSizes = [192, 512];
    for (const size of maskableSizes) {
      const outputPath = path.join(publicDir, `icon-${size}x${size}-maskable.png`);
      await sharp(logoPath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent background
        })
        .png()
        .toFile(outputPath);
      console.log(`[v0] Generated icon-${size}x${size}-maskable.png`);
    }

    console.log('[v0] All PWA icons generated successfully!');
  } catch (error) {
    console.error('[v0] Error generating icons:', error.message);
    process.exit(1);
  }
}

generateIcons();
