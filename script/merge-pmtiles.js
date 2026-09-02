const fs = require("fs");
const path = require("path");

const CHUNK_DIR = path.join("public/maps/pmtiles-chunks");
const OUT_FILE = path.join("public/maps/vietnam.pmtiles");

if (fs.existsSync(OUT_FILE)) {
  console.log("vietnam.pmtiles already exists, skip merge.");
  process.exit(0);
}

const parts = fs
  .readdirSync(CHUNK_DIR)
  .filter((f) => f.startsWith("vietnam.pmtiles.part"))
  .sort(); // tên có số 000, 001... nên sort chuỗi là đúng thứ tự

if (parts.length === 0) {
  console.error("Không tìm thấy chunk nào trong", CHUNK_DIR);
  process.exit(1);
}

const out = fs.createWriteStream(OUT_FILE);
for (const p of parts) {
  out.write(fs.readFileSync(path.join(CHUNK_DIR, p)));
}
out.end(() => console.log(`Merged ${parts.length} parts -> ${OUT_FILE}`));
