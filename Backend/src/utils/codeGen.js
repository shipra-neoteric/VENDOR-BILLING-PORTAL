const { nextCode } = require('./sequence');

const nextVendorCode  = () => nextCode('vendorCode', 'VC-', 4);
const nextProjectCode = () => nextCode('projectCode', 'PRJ-', 3);
const nextWorkOrderNo = () => nextCode('workOrderNo', 'WO-', 4);
const nextBillNo      = () => nextCode('billNo', 'RA-', 4);
const nextQuotationNo = () => nextCode('quotationNo', 'QT-', 4);
const nextConsultantCode     = () => nextCode('consultantCode', 'CN-', 4);
const nextConsultancyOrderNo = () => nextCode('consultancyOrderNo', 'CWO-', 4);
const nextVendorGroupCode    = () => nextCode('vendorGroupCode', 'VG-', 4);

module.exports = {
  nextVendorCode, nextProjectCode, nextWorkOrderNo, nextBillNo, nextQuotationNo,
  nextConsultantCode, nextConsultancyOrderNo, nextVendorGroupCode,
};
