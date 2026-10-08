require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
  const uri = process.env.MONGO_URI.replace("/vbp_dev?", "/vbp?");
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const contractor = await db.collection("contractors").findOne({ vendorCode: "VC-0161" });
  if (!contractor) {
    console.log("VC-0161 not found in contractors - aborting, nothing changed.");
    await mongoose.disconnect();
    return;
  }

  const result = await db.collection("billrequests").updateOne(
    { reqNo: "BR-0390" },
    { $set: { vendorCode: "VC-0161", vendorName: contractor.companyName } }
  );

  console.log("BR-0390 update:", result.matchedCount, result.modifiedCount, "-> vendorName set to", contractor.companyName);
  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
