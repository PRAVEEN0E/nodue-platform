import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Production / system seed ─────────────────────────────────────────────
// Contains ONLY required system configuration (the 11 departments).
// It must NEVER create demo users, classrooms, or transactional data.
// For local development fixtures, run the opt-in demo seed instead:
//   npx tsx prisma/seed.demo.ts

const DEPARTMENTS = [
  { code: "AIML", name: "Artificial Intelligence and Machine Learning" },
  { code: "AIDS", name: "Artificial Intelligence and Data Science" },
  { code: "CSE", name: "Computer Science and Engineering" },
  { code: "IT", name: "Information Technology" },
  { code: "MECH", name: "Mechanical Engineering" },
  { code: "BME", name: "Biomedical Engineering" },
  { code: "MDE", name: "Medical Electronics Engineering" },
  { code: "CIVIL", name: "Civil Engineering" },
  { code: "CYBER SECURITY", name: "Cyber Security" },
  { code: "ECE", name: "Electronics and Communication Engineering" },
  { code: "EEE", name: "Electrical and Electronics Engineering" },
];

async function main() {
  console.log("Seeding required system configuration (departments only)...");

  for (const dept of DEPARTMENTS) {
    const record = await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name },
      create: {
        code: dept.code,
        name: dept.name,
      },
    });
    console.log(`  Department: ${record.code}`);
  }

  console.log("System seed completed successfully.");
}

main()
  .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
