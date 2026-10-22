import type { Direction } from "../lib/generated/prisma/client";
import { createScriptClient } from "./script-client";

const MONTHS = 6;

// Deterministic PRNG so demo data is reproducible
let state = 42;
function rand() {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
}
function between(min: number, max: number) {
  return Math.round((min + rand() * (max - min)) * 100);
}

type Row = {
  date: Date;
  description: string;
  amountCents: number;
  direction: Direction;
  category: string;
};

async function main() {
  const db = createScriptClient();
  try {
    const categories = await db.category.findMany();
    if (categories.length === 0) {
      throw new Error("No categories found. Run `npm run db:seed` first.");
    }
    const byName = new Map(categories.map((c) => [c.name, c.id]));

    const rows: Row[] = [];
    const today = new Date();
    for (let i = MONTHS - 1; i >= 0; i--) {
      const first = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const y = first.getFullYear();
      const m = first.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const lastDay = i === 0 ? today.getDate() : daysInMonth;
      const add = (
        day: number,
        description: string,
        category: string,
        amountCents: number,
        direction: Direction = "DEBIT",
      ) => {
        if (day <= lastDay) {
          rows.push({
            date: new Date(Date.UTC(y, m, day)),
            description,
            amountCents,
            direction,
            category,
          });
        }
      };

      add(1, "Employer payroll", "Salary", 420000, "CREDIT");
      add(15, "Employer payroll", "Salary", 420000, "CREDIT");
      add(28, "Savings account interest", "Interest", between(8, 15), "CREDIT");
      add(1, "Monthly rent", "Rent/Mortgage", 210000);
      add(5, "PG&E", "Electricity", between(70, 140));
      add(7, "City water", "Water & Sewer", between(35, 60));
      add(10, "Comcast", "Internet", 7999);
      add(12, "Verizon", "Mobile Phone", 8500);
      add(3, "Netflix", "Streaming & Subscriptions", 1549);
      add(3, "Spotify", "Streaming & Subscriptions", 1199);
      add(20, "Gym membership", "Fitness", 4500);
      add(18, "Auto insurance", "Auto Insurance", 13200);
      add(25, "Credit card payment", "Credit Card Payment", between(1200, 2200));
      add(16, "Transfer to savings", "Savings Contribution", 50000);

      for (let d = 2; d <= daysInMonth; d += 7) {
        add(d, "Safeway", "Groceries", between(60, 180));
      }
      const restaurants = ["Chipotle", "Sushi place", "Pizza night", "Thai Kitchen"];
      for (let d = 4; d <= daysInMonth; d += 5) {
        const name = restaurants[Math.floor(rand() * restaurants.length)];
        add(d, name, "Dining Out", between(20, 90));
      }
      for (let d = 6; d <= daysInMonth; d += 10) {
        add(d, "Shell gas station", "Fuel", between(40, 70));
      }
      add(9, "Starbucks", "Coffee", between(5, 12));
      add(22, "Starbucks", "Coffee", between(5, 12));
      add(14, "Movie tickets", "Movies & Events", between(25, 60));
      add(19, "Amazon", "Household Supplies", between(20, 120));
      add(26, "Target", "Clothing", between(30, 150));
      if (rand() > 0.6) {
        add(21, "Amazon return", "Household Supplies", between(15, 40), "CREDIT");
      }
      if (m % 3 === 2) add(27, "Quarterly bonus", "Bonus", 150000, "CREDIT");
    }

    await db.transaction.createMany({
      data: rows.map(({ category, ...r }) => {
        const categoryId = byName.get(category);
        if (!categoryId) throw new Error(`Missing category: ${category}`);
        return { ...r, categoryId };
      }),
    });
    console.log(`Inserted ${rows.length} demo transactions`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
