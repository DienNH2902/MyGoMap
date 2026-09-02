const fs = require("fs");
const path = require("path");

const SRC = path.join("public/maps/vietnam.pmtiles");
const OUT_DIR = path.join("public/maps/pmtiles-chunks");
const CHUNK_SIZE = 45 * 1024 * 1024; // 45MB/part, an toàn dưới ngưỡng cảnh báo 50MB của GitHub

fs.mkdirSync(OUT_DIR, { recursive: true });
const buf = fs.readFileSync(SRC);
const total = Math.ceil(buf.length / CHUNK_SIZE);

for (let i = 0; i < total; i++) {
  const chunk = buf.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
  const name = `vietnam.pmtiles.part${String(i).padStart(3, "0")}`;
  fs.writeFileSync(path.join(OUT_DIR, name), chunk);
  console.log(`wrote ${name} (${(chunk.length / 1024 / 1024).toFixed(1)}MB)`);
}
console.log(`Done: ${total} parts`);
