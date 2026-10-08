require("dotenv").config();
const { MongoClient } = require("mongodb");

async function run() {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
        throw new Error("MONGO_URI is missing from .env");
    }

    const client = new MongoClient(mongoUri);

    try {
        await client.connect();

        const db = client.db("vbp_dev");

        console.log("\n========================================");
        console.log("        VMS DATA VERIFICATION");
        console.log("========================================");

        // --------------------------------------------------
        // 1. TOTAL COUNTS
        // --------------------------------------------------

        const dprCollection = db.collection("dailyprogressreports");
        const drawingCollection = db.collection("drawingrequests");

        const dprCount = await dprCollection.countDocuments();
        const drawingCount = await drawingCollection.countDocuments();

        console.log("\n========== TOTAL DATA ==========");
        console.log("Daily Progress Reports :", dprCount);
        console.log("Drawing Requests       :", drawingCount);

        // --------------------------------------------------
        // 2. DPR PROJECT-WISE COUNT
        // --------------------------------------------------

        const dprProjects = await dprCollection
            .aggregate([
                {
                    $group: {
                        _id: "$projectName",
                        count: { $sum: 1 }
                    }
                },
                {
                    $sort: {
                        _id: 1
                    }
                }
            ])
            .toArray();

        console.log("\n========== DPR BY PROJECT ==========");

        for (const item of dprProjects) {
            console.log(`${item._id} : ${item.count}`);
        }

        // --------------------------------------------------
        // 3. DRAWING REQUEST PROJECT-WISE COUNT
        // --------------------------------------------------

        const drawingProjects = await drawingCollection
            .aggregate([
                {
                    $group: {
                        _id: "$projectName",
                        count: { $sum: 1 }
                    }
                },
                {
                    $sort: {
                        _id: 1
                    }
                }
            ])
            .toArray();

        console.log("\n========== DRAWING REQUESTS BY PROJECT ==========");

        for (const item of drawingProjects) {
            console.log(`${item._id} : ${item.count}`);
        }

        // --------------------------------------------------
        // 4. TEST PROJECT VERIFICATION
        // --------------------------------------------------

        const testProjects = [
            "Automated Test Project PRJ-4096",
            "Automated Test Project PRJ-6176",
            "Automated Test Project PRJ-8320"
        ];

        console.log("\n========== TEST PROJECT VERIFICATION ==========");

        for (const name of testProjects) {
            const project = await db.collection("projects").findOne({
                $or: [
                    { name: name },
                    { projectName: name }
                ]
            });

            console.log("\nProject:", name);

            if (project) {
                console.log("FOUND");
                console.log(JSON.stringify(project, null, 2));
            } else {
                console.log("NOT FOUND");
            }
        }

        // --------------------------------------------------
        // 5. SAMPLE DPR
        // --------------------------------------------------

        const sampleDpr = await dprCollection.findOne({});

        console.log("\n========== SAMPLE DPR ==========");

        if (sampleDpr) {
            console.log(JSON.stringify(sampleDpr, null, 2));
        } else {
            console.log("No DPR found.");
        }

        // --------------------------------------------------
        // 6. SAMPLE DRAWING REQUEST
        // --------------------------------------------------

        const sampleDrawing = await drawingCollection.findOne({});

        console.log("\n========== SAMPLE DRAWING REQUEST ==========");

        if (sampleDrawing) {
            console.log(JSON.stringify(sampleDrawing, null, 2));
        } else {
            console.log("No Drawing Request found.");
        }

        // --------------------------------------------------
        // 7. SUMMARY
        // --------------------------------------------------

        console.log("\n========================================");
        console.log("              SUMMARY");
        console.log("========================================");

        console.log(`DPR records        : ${dprCount}`);
        console.log(`Drawing Requests   : ${drawingCount}`);
        console.log(`Total records      : ${dprCount + drawingCount}`);

        console.log("\nVerification completed successfully.");
    } finally {
        await client.close();
    }
}

run().catch((error) => {
    console.error("\n❌ Verification failed:");
    console.error(error.message);
    process.exit(1);
});