const { nextCode } = require('./sequence');

const nextVendorCode  = () => nextCode('vendorCode', 'VC-', 4);
const nextProjectCode = () => nextCode('projectCode', 'PRJ-', 3);
const nextWorkOrderNo = () => nextCode('workOrderNo', 'WO-', 4);
const nextBillNo      = () => nextCode('billNo', 'RA-', 4);
// Shared with billRequestController.js's own BillRequest.reqNo — a manually-
// created bill (Billing -> New Bill) uses this SAME counter for its
// pending-approval placeholder number, so "BR-0350" is always exactly one
// thing (never both a real BillRequest and an unrelated manual bill at the
// same time), same as a real BillRequest gets. See billController.js's
// createBill/manual*Approve — the placeholder is held in RunningBill.billNo
// itself (not a new field) until the bill's last required manual sign-off
// replaces it with a real nextBillNo() RA-number.
const nextBillRequestReqNo = () => nextCode('billRequestReqNo', 'BR-', 4);
const nextQuotationNo = () => nextCode('quotationNo', 'QT-', 4);
const nextConsultantCode     = () => nextCode('consultantCode', 'CN-', 4);
const nextConsultancyOrderNo = () => nextCode('consultancyOrderNo', 'CWO-', 4);
const nextVendorGroupCode    = () => nextCode('vendorGroupCode', 'VG-', 4);
const nextDrawingRequestTicketNo = () => nextCode('drawingRequestTicketNo', 'DR-', 4);

module.exports = {
  nextVendorCode, nextProjectCode, nextWorkOrderNo, nextBillNo, nextQuotationNo,
  nextConsultantCode, nextConsultancyOrderNo, nextVendorGroupCode, nextDrawingRequestTicketNo,
  nextBillRequestReqNo,
};
