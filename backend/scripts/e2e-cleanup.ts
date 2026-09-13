import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const prisma = new PrismaClient();
  const idsPath = path.join(__dirname, "..", ".e2e-fv-ids.json");
  const { td } = JSON.parse(fs.readFileSync(idsPath, "utf-8"));

  console.log("Cleaning up E2E fee-verification fixtures...");
  await prisma.feeVerification.deleteMany({
    where: { student: { user: { email: { endsWith: `@${td}` } } } },
  });
  await prisma.student.deleteMany({ where: { user: { email: { endsWith: `@${td}` } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${td}` } } });
  console.log("Done.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL", e);
  process.exit(1);
});