import { db } from "@workspace/db";
import { sitesTable, alertConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding monitored sites...");

  const existingSites = await db.select().from(sitesTable);

  if (existingSites.length > 0) {
    console.log(`Found ${existingSites.length} existing sites, skipping seed.`);
  } else {
    await db.insert(sitesTable).values([
      {
        name: "Love Furniture IE",
        url: "https://www.lovefurniture.ie/",
        isActive: true,
        slowThresholdMs: 5000,
      },
      {
        name: "Love Furniture UK",
        url: "https://www.lovefurniture.co.uk/",
        isActive: true,
        slowThresholdMs: 5000,
      },
    ]);
    console.log("Seeded 2 monitored sites.");
  }

  const existingConfig = await db.select().from(alertConfigTable);

  if (existingConfig.length === 0) {
    await db.insert(alertConfigTable).values({
      recipientEmails: "",
      senderEmail: "",
      isEnabled: true,
    });
    console.log("Seeded default alert config.");
  }

  console.log("Done!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
