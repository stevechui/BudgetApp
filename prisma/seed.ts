import type { CategoryType } from "../lib/generated/prisma/client";
import { createScriptClient } from "./script-client";

const SEED: { group: string; type: CategoryType; categories: string[] }[] = [
  {
    group: "Income",
    type: "CREDIT",
    categories: [
      "Salary",
      "Bonus",
      "Interest",
      "Dividends",
      "Rental Income",
      "Investment Income",
      "Refunds & Reimbursements",
      "Other Income",
    ],
  },
  {
    group: "Housing",
    type: "DEBIT",
    categories: [
      "Rent/Mortgage",
      "Property Tax",
      "Home Insurance",
      "Maintenance & Repairs",
      "HOA Fees",
    ],
  },
  {
    group: "Utilities",
    type: "DEBIT",
    categories: [
      "Gas/Electricity",
      "Water & Sewer",
      "Drinking Water",
      "Internet",
      "Mobile Phone",
      "Trash",
    ],
  },
  {
    group: "Food",
    type: "DEBIT",
    categories: ["Groceries", "Dining Out", "Coffee"],
  },
  {
    group: "Transportation",
    type: "DEBIT",
    categories: [
      "Fuel",
      "Public Transit",
      "Parking & Tolls",
      "Auto Insurance",
      "Car Maintenance",
      "Rideshare",
    ],
  },
  {
    group: "Health",
    type: "DEBIT",
    categories: ["Health Insurance", "Doctor & Dental", "Pharmacy", "Fitness"],
  },
  {
    group: "Personal & Shopping",
    type: "DEBIT",
    categories: [
      "Clothing",
      "Personal Care",
      "Household Supplies",
      "Electronics",
      "Gifts",
    ],
  },
  {
    group: "Entertainment",
    type: "DEBIT",
    categories: [
      "Streaming & Subscriptions",
      "Movies & Events",
      "Hobbies",
      "Travel",
    ],
  },
  {
    group: "Financial",
    type: "DEBIT",
    categories: [
      "Bank Fees",
      "Loan Payments",
      "Taxes",
      "Childcare & Education",
      "Charity",
    ],
  },
  {
    group: "Transfers",
    type: "TRANSFER",
    categories: [
      "Credit Card Payment",
      "Account Transfer",
      "Savings Contribution",
      "Investment Contribution",
    ],
  },
];

async function main() {
  const db = createScriptClient();
  try {
    for (const { group, type, categories } of SEED) {
      const g = await db.categoryGroup.upsert({
        where: { name: group },
        update: {},
        create: { name: group },
      });
      for (const name of categories) {
        await db.category.upsert({
          where: { name },
          update: {},
          create: { name, type, groupId: g.id },
        });
      }
    }
    await db.account.upsert({
      where: { name: "Main Account" },
      update: {},
      create: { name: "Main Account", type: "CHECKING" },
    });
    const [groups, cats, accounts] = await Promise.all([
      db.categoryGroup.count(),
      db.category.count(),
      db.account.count(),
    ]);
    console.log(`Seeded: ${groups} category groups, ${cats} categories, ${accounts} accounts`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
