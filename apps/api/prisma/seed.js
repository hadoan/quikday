"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    // Seed a default team for local/dev usage
    const team = await prisma.team.upsert({
        where: { id: 1 },
        update: {},
        create: { name: "Runfast Dev Team" },
    });
    console.log("Seeded team:", team);
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map