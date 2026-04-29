const { Jimp } = require('jimp');
const path = require('path');
const fs = require('fs');

async function createIco() {
  const inputPng = process.argv[2];
  const outputIco = process.argv[3];
  
  if (!fs.existsSync(inputPng)) {
    console.error('Input file not found:', inputPng);
    process.exit(1);
  }

  const sizes = [16, 32, 48, 64, 128, 256];
  const images = [];

  for (const size of sizes) {
    const img = await Jimp.read(inputPng);
    img.resize({ w: size, h: size });
    const pngBuffer = await img.getBuffer('image/png');
    images.push({ size, buffer: pngBuffer });
  }

  const numImages = images.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dataOffset = headerSize + dirEntrySize * numImages;

  let totalSize = dataOffset;
  for (const img of images) totalSize += img.buffer.length;

  const ico = Buffer.alloc(totalSize);
  let offset = 0;

  ico.writeUInt16LE(0, offset); offset += 2;
  ico.writeUInt16LE(1, offset); offset += 2;
  ico.writeUInt16LE(numImages, offset); offset += 2;

  let dataStart = dataOffset;
  for (const img of images) {
    const s = img.size === 256 ? 0 : img.size;
    ico.writeUInt8(s, offset); offset += 1;
    ico.writeUInt8(s, offset); offset += 1;
    ico.writeUInt8(0, offset); offset += 1;
    ico.writeUInt8(0, offset); offset += 1;
    ico.writeUInt16LE(1, offset); offset += 2;
    ico.writeUInt16LE(32, offset); offset += 2;
    ico.writeUInt32LE(img.buffer.length, offset); offset += 4;
    ico.writeUInt32LE(dataStart, offset); offset += 4;
    dataStart += img.buffer.length;
  }

  for (const img of images) {
    img.buffer.copy(ico, offset);
    offset += img.buffer.length;
  }

  fs.writeFileSync(outputIco, ico);
  console.log(`Created ICO: ${outputIco} (${sizes.join(', ')}px)`);
}

createIco().catch(err => {
  console.error('ICO creation failed:', err.message);
  process.exit(1);
});
