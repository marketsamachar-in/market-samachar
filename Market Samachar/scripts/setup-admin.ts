import bcrypt from "bcryptjs";

const password = process.argv[2];

if (!password) {
  console.log("Usage: npm run setup-admin <yourpassword>");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);

console.log("\nAdd this to your .env.local file:");
console.log(`ADMIN_PASSWORD="${hash}"`);
console.log("\nDone. Keep your password safe.");
