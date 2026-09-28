require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
  const uri = process.env.MONGO_URI.replace("/vbp_dev?", "/vbp?");

  await mongoose.connect(uri);

  const db = mongoose.connection.db;

  const companyId = new mongoose.Types.ObjectId("6a438eb19e53c55f061f7105");

  const result = await db.collection("runningbills").updateOne(
    { billNo: "RA-0359" },
    {
      $set: {
        companyId: companyId,
        companyName: "GLR Real Estate Pvt Ltd"
      }
    }
  );

  console.log("RA-0359 update:", result.matchedCount, result.modifiedCount);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
