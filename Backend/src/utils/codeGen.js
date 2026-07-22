const { nextCode } = require('./sequence');

const nextVendorCode  = () => nextCode('vendorCode', 'VC-', 4);
const nextProjectCode = () => nextCode('projectCode', 'PRJ-', 3);
const nextWorkOrderNo = () => nextCode('workOrderNo', 'WO-', 4);
const nextBillNo      = () => nextCode('billNo', 'RA-', 4);

module.exports = { nextVendorCode, nextProjectCode, nextWorkOrderNo, nextBillNo };
