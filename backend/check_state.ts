import { prisma, connectDatabase, disconnectDatabase } from "./src/plugins/database";

async function main() {
  await connectDatabase();
  const departments = await prisma.department.findMany({
    select: { code: true, name: true, hodUserId: true },
    orderBy: { code: "asc" },
  });
  console.log("Current department HOD state:");
  departments.forEach((d) => {
    console.log(`  ${d.code}: hodUserId=${d.hodUserId ?? "NULL"}`);
  });
  
  const hodUsers = await prisma.user.findMany({
    where: { role: "HOD" },
    select: { id: true, email: true, isActive: true, departmentId: true },
  });
  console.log("\nHOD users:");
  hodUsers.forEach((u) => console.log(`  ${u.email} (dept=${u.departmentId}, active=${u.isActive})`));
  
  await disconnectDatabase();
}

main().catch(console.error);
