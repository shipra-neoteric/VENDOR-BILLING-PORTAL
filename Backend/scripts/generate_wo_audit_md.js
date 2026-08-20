require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

async function generateAuditReport() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.client.db('vbp');
  
  const workOrders = await db.collection('workorders').find({}).sort({ workOrderNo: 1 }).toArray();
  
  const noApprovals = [];
  const partialApprovals = [];
  const fullApprovals = [];

  for (const wo of workOrders) {
    const hasChecker = !!wo.checkerBy;
    const hasApprover = !!wo.approverBy;
    const hasFinal = !!wo.finalApprovedBy;
    const historyCount = Array.isArray(wo.approvalHistory) ? wo.approvalHistory.length : 0;

    const record = {
      woNo: wo.workOrderNo,
      approvalStatus: wo.approvalStatus || 'approved (default)',
      status: wo.status || 'draft',
      isLocked: wo.isLocked ? 'Yes' : 'No',
      company: wo.companyName || '—',
      project: wo.projectName || '—',
      vendorCode: wo.vendorCode || '—',
      vendorName: wo.vendorName || '—',
      createdAt: wo.createdAt ? new Date(wo.createdAt).toLocaleDateString('en-GB') : '—',
    };

    if (!hasChecker && !hasApprover && !hasFinal && historyCount === 0) {
      noApprovals.push(record);
    } else if (hasChecker && hasApprover && hasFinal) {
      fullApprovals.push(record);
    } else {
      partialApprovals.push(record);
    }
  }

  let markdown = `# Work Order Digital Approval Audit Report

> [!NOTE]
> This report categorizes all **${workOrders.length} Work Orders** currently in the production database (\`vbp\`) based on the presence of digital approval stamps (\`checkerBy\`, \`approverBy\`, \`finalApprovedBy\`) and workflow history.

## Summary Overview

| Category | Count | Description |
| :--- | :---: | :--- |
| **No Digital Approvals** | **${noApprovals.length}** | Legacy / pre-existing Work Orders with no digital signatures or workflow log. |
| **Partial Approvals** | **${partialApprovals.length}** | Work Orders currently undergoing the 4-level approval chain. |
| **Full Digital Approvals** | **${fullApprovals.length}** | Work Orders with complete digital approval stamps (Checker, Approver, Final). |
| **Total Work Orders** | **${workOrders.length}** | Total Work Orders across all projects and companies. |

---

## Work Orders Without Digital Approvals (${noApprovals.length} Total)

These Work Orders are marked as \`approved\` or active in the database, but their PDFs and workflow history currently show **no signatures ("No workflow activity yet")**:

| # | Work Order No | Approval Status | Status | Company | Project | Vendor | Created Date |
| -: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;

  noApprovals.forEach((wo, idx) => {
    markdown += `| ${idx + 1} | **${wo.woNo}** | \`${wo.approvalStatus}\` | \`${wo.status}\` | ${wo.company} | ${wo.project} | ${wo.vendorName} (${wo.vendorCode}) | ${wo.createdAt} |\n`;
  });

  const artifactPath = path.join('C:\\Users\\Welcome\\.gemini\\antigravity-ide\\brain\\b4288251-e2dc-4baa-99ed-ff3508894ab8', 'work_order_approval_audit.md');
  fs.writeFileSync(artifactPath, markdown, 'utf8');

  console.log(`Generated audit report at ${artifactPath}`);
  await mongoose.disconnect();
}

generateAuditReport().catch(err => {
  console.error(err);
  mongoose.disconnect();
});
