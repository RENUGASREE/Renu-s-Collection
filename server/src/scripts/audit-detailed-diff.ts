import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import mongoose from "mongoose";
import { createPostgresPool } from "../db/postgres.js";

async function main() {
  const standardFallbackUri = "mongodb://renuscollection05_db_user:Renusbusiness05@ac-fqlzkge-shard-00-00.6tjhjnt.mongodb.net:27017,ac-fqlzkge-shard-00-01.6tjhjnt.mongodb.net:27017,ac-fqlzkge-shard-00-02.6tjhjnt.mongodb.net:27017/test?ssl=true&replicaSet=atlas-kn0clw-shard-0&authSource=admin";
  await mongoose.connect(standardFallbackUri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db!;

  const pool: any = createPostgresPool();
  const pgClient = await pool.connect();

  console.log("=== INSPECTING USERS IN MONGODB VS POSTGRES ===");
  const mongoUsers = await db.collection("users").find({}).toArray();
  console.log("MongoDB Users:");
  for (const u of mongoUsers) {
    console.log(`- ID: ${u._id} | Email: ${u.email} | Name: ${u.name} | Role: ${u.role} | Created: ${u.createdAt} | Updated: ${u.updatedAt}`);
  }

  const pgUsers = await pgClient.query("SELECT * FROM users");
  console.log("\nPostgreSQL Users:");
  for (const u of pgUsers.rows) {
    console.log(`- ID: ${u.id} | Email: ${u.email} | Name: ${u.name} | Role: ${u.role} | Updated: ${u.updated_at}`);
  }

  console.log("\n=== INSPECTING POST-NOV-20 MODIFICATIONS IN STUDIO CONFIGS ===");
  const modifiedJewellery = await db.collection("jewellerytypes").findOne({ _id: new mongoose.Types.ObjectId("6ad3ae83e8db9a726259cc7d") });
  console.log("JewelleryType 6ad3ae83e8db9a726259cc7d in Mongo (Updated: " + modifiedJewellery?.updatedAt + "):");
  console.log(JSON.stringify(modifiedJewellery, null, 2));

  const pgJewellery = await pgClient.query("SELECT * FROM jewellery_types WHERE id = '6ad3ae83e8db9a726259cc7d'");
  console.log("JewelleryType in Postgres:");
  console.log(JSON.stringify(pgJewellery.rows[0], null, 2));

  const modifiedMaking = await db.collection("makingcharges").findOne({ _id: new mongoose.Types.ObjectId("6ad3ae84e8db9a726259cc82") });
  console.log("\nMakingCharge 6ad3ae84e8db9a726259cc82 in Mongo (Updated: " + modifiedMaking?.updatedAt + "):");
  console.log(JSON.stringify(modifiedMaking, null, 2));

  const pgMaking = await pgClient.query("SELECT * FROM making_charges WHERE id = '6ad3ae84e8db9a726259cc82'");
  console.log("MakingCharge in Postgres:");
  console.log(JSON.stringify(pgMaking.rows[0], null, 2));

  const modifiedRule = await db.collection("designrules").findOne({ _id: new mongoose.Types.ObjectId("6ad3ae84e8db9a726259cc81") });
  console.log("\nDesignRule 6ad3ae84e8db9a726259cc81 in Mongo (Updated: " + modifiedRule?.updatedAt + "):");
  console.log(JSON.stringify(modifiedRule, null, 2));

  const pgRule = await pgClient.query("SELECT * FROM design_rules WHERE id = '6ad3ae84e8db9a726259cc81'");
  console.log("DesignRule in Postgres:");
  console.log(JSON.stringify(pgRule.rows[0], null, 2));

  // Also check admin user in Mongo vs Postgres
  const mongoAdmin = await db.collection("users").findOne({ _id: new mongoose.Types.ObjectId("6a9552a173d000847babfb09") });
  console.log("\nAdmin User in Mongo:");
  console.log(JSON.stringify(mongoAdmin, null, 2));

  const pgAdmin = await pgClient.query("SELECT * FROM users WHERE id = '6a9552a173d000847babfb09'");
  console.log("Admin User in Postgres:");
  console.log(JSON.stringify(pgAdmin.rows[0], null, 2));

  pgClient.release();
  await pool.end();
  await mongoose.disconnect();
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
