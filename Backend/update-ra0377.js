
require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
    const uri = process.env.MONGO_URI.replace("/vbp_dev?", "/vbp?");
    await mongoose.connect(uri);
    const db = mongoose.connection.db;

    const bill = await db.collection("runningbills").findOne({ billNo: "RA-0377" });
    if (!bill) { console.log("RA-0377 not found"); await mongoose.disconnect(); return; }

    const result = await db.collection("runningbills").updateOne(
        { billNo: "RA-0377" },
        {
            $set: {
                manualAgmApprovedAt: bill.createdAt,
                "approvalHistory.$[entry].at": bill.createdAt,
            }
        },
        { arrayFilters: [{ "entry.stage": "manual-agm" }] }
    );

    console.log("RA-0377 update:", result.matchedCount, result.modifiedCount, "-> manualAgmApprovedAt set to", bill.createdAt);

    const after = await db.collection("runningbills").findOne({ billNo: "RA-0377" });
    console.log("manualAgmApprovedAt:", after.manualAgmApprovedAt);
    console.log("approvalHistory:", JSON.stringify(after.approvalHistory, null, 2));

    await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
