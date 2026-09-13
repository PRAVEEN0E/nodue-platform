import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const prisma = new PrismaClient();
  const TD = "e2efee.local";
  const hash = await hashPassword("E2e@12345");

  const cse = await prisma.department.findUniqueOrThrow({ where: { code: "CSE" } });
  const advisorClassroom = await prisma.classroom.findFirstOrThrow({ where: { name: "CSE-IV-A" } });

  async function mk(tag: string, firstName: string, lastName: string) {
    const em = `${tag}@${TD}`;
    const existing = await prisma.user.findUnique({ where: { email: em } });
    if (existing) {
      console.log(`  ${tag} already exists (${existing.id})`);
      return existing.id;
    }
    const u = await prisma.user.create({
      data: { firstName, lastName, email: em, passwordHash: hash, role: Role.STUDENT, departmentId: cse.id },
    });
    await prisma.student.create({
      data: { userId: u.id, registerNumber: `FV${tag.toUpperCase()}`, classroomId: advisorClassroom.id, departmentId: cse.id, admissionYear: 2024 },
    });
    console.log(`  created ${tag} (${u.id})`);
    return u.id;
  }

  const g1 = await mk("e2eg1", "E2E", "Student1");
  const g2 = await mk("e2eg2", "E2E", "Student2");

  const idsPath = path.join(__dirname, "..", ".e2e-fv-ids.json");
  fs.writeFileSync(idsPath, JSON.stringify({ g1, g2, td: TD }, null, 2));
  console.log(`  wrote ${idsPath}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL", e);
  process.exit(1);
});
