import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const prisma = new PrismaClient();

async function main() {
  const mode = process.argv[2] || "up";
  if (mode === "down") {
    const users = await prisma.user.findMany({
      where: { email: { endsWith: "@fee2e.verify.local" } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length > 0) {
      await prisma.fee.deleteMany({ where: { student: { userId: { in: ids } } } });
      await prisma.student.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    console.log("cleaned");
    return;
  }

  const hash = await hashPassword("Verify@12345");
  const cse = await prisma.department.findUniqueOrThrow({ where: { code: "CSE" } });
  const room = await prisma.classroom.findFirstOrThrow({ where: { name: "CSE-IV-A" } });
  for (const tag of ["g1", "g2"]) {
    const u = await prisma.user.create({
      data: { firstName: "Fee", lastName: `E2E${tag}`, email: `pupil-${tag}@fee2e.verify.local`, passwordHash: hash, role: Role.STUDENT, departmentId: cse.id },
    });
    const s = await prisma.student.create({
      data: { userId: u.id, registerNumber: `FVE2E${tag.toUpperCase()}`, classroomId: room.id, departmentId: cse.id, admissionYear: 2024 },
    });
    await prisma.fee.create({
      data: { studentId: s.id, title: `FVE2E Tuition ${tag}`, totalAmount: 50000, paidAmount: 0, status: "PENDING" },
    });
    console.log(`student ${tag}: ${s.id}`);
  }
}

main().finally(() => prisma.$disconnect());
