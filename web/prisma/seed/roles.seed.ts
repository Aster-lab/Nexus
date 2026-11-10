import {prisma} from '../../src/lib/prisma';

const predefinedRoles = [
  {
    code: "BORROWER",
    name: "Borrower",
    description:
      "A user who applies for loans and manages borrowing activities on the platform.",
  },
  {
    code: "INVESTOR",
    name: "Investor",
    description:
      "A user who browses loan opportunities and invests in eligible loans.",
  },
  {
    code: "ADMIN",
    name: "Administrator",
    description:
      "An authorized platform administrator who manages platform operations and governance.",
  },
];

export async function seedRoles() {
  console.log("Seeding roles...");

  for (const role of predefinedRoles) {
    await prisma.role.upsert({
      where: {
        code: role.code,
      },
      update: {
        name: role.name,
        description: role.description,
      },
      create: role,
    });
  }

  console.log("Roles seeded successfully.");
}