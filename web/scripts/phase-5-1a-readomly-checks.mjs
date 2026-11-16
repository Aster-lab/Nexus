
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const queries = [
  {
    name: "1. Duplicate user-owned wallets",
    sql: `
      SELECT owner_user_id, COUNT(*) AS wallet_count
      FROM wallets
      WHERE owner_user_id IS NOT NULL
      GROUP BY owner_user_id
      HAVING COUNT(*) > 1;
    `,
  },
  {
    name: "2. Duplicate platform-owned wallets",
    sql: `
      SELECT owner_platform_account_id, COUNT(*) AS wallet_count
      FROM wallets
      WHERE owner_platform_account_id IS NOT NULL
      GROUP BY owner_platform_account_id
      HAVING COUNT(*) > 1;
    `,
  },
  {
    name: "3. Negative wallet balances",
    sql: `
      SELECT id, balance_satang
      FROM wallets
      WHERE balance_satang < 0;
    `,
  },
  {
    name: "4. Wallet currencies",
    sql: `SELECT DISTINCT currency FROM wallets;`,
  },
  {
    name: "5. Platform account currencies",
    sql: `SELECT DISTINCT currency FROM platform_accounts;`,
  },
  {
    name: "6. Ledger entry currencies",
    sql: `SELECT DISTINCT currency FROM ledger_entries;`,
  },
  {
    name: "7. Wallet indexes",
    sql: `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'wallets'
      ORDER BY indexname;
    `,
  },
  {
    name: "8. Financial CHECK constraints",
    sql: `
      SELECT
        tc.table_name,
        tc.constraint_name,
        cc.check_clause
      FROM information_schema.table_constraints tc
      JOIN information_schema.check_constraints cc
        ON tc.constraint_catalog = cc.constraint_catalog
        AND tc.constraint_schema = cc.constraint_schema
        AND tc.constraint_name = cc.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name IN (
          'wallets',
          'platform_accounts',
          'ledger_entries'
        )
        AND tc.constraint_type = 'CHECK'
      ORDER BY tc.table_name, tc.constraint_name;
    `,
  },
  {
    name : "9. unique wallet indexes",
    sql : `
      SELECT
        conname,
        pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid IN (
        'wallets'::regclass,
        'platform_accounts'::regclass,
        'ledger_entries'::regclass
    )
    AND conname IN (
        'wallets_balance_satang_nonnegative_check',
        'wallets_currency_thb_check',
        'platform_accounts_currency_thb_check',
        'ledger_entries_currency_thb_check'
    )
    ORDER BY conname;
  `
  }
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing from .env");
  }

  if (!process.env.DATABASE_ENV) {
    throw new Error("DATABASE_ENV is missing from .env");
  }

  console.log("Database environment:", process.env.DATABASE_ENV);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");

    for (const item of queries) {
      console.log(`\n========== ${item.name} ==========`);

      const result = await client.query(item.sql);

      if (result.rows.length === 0) {
        console.log("No rows returned.");
      } else {
        console.table(result.rows);
      }

      console.log("Rows:", result.rowCount);
    }

    await client.query("ROLLBACK");
    console.log("\nAll checks completed. Read-only transaction rolled back.");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("\nSQL checks failed:", error.message);
  process.exitCode = 1;
});
