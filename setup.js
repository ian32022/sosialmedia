const fs = require("fs");

const dirs = [
  "src/config", "src/controllers", "src/routes",
  "src/middleware", "src/utils", "uploads/images",
  "uploads/avatars", "uploads/stories", "uploads/chat"
];

dirs.forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
  console.log(`  Created: ${dir}`);
});

console.log("\nSemua direktori berhasil dibuat.");
