import dayjs from "dayjs";
import { PenTool } from "lucide-react";
import Modal from "../ui/Modal";
import Btn from "../ui/Btn";
import Badge from "../ui/Badge";
import { Descriptions, DescItem } from "../ui/Descriptions";
import {
  STATUS_LABEL, STATUS_COLOR, PRIORITY_LABEL, PRIORITY_COLOR, delayDays,
} from "../shared/constants/drawingRequestOptions";
import type { DrawingRequest } from "../shared/constants/drawingRequestOptions";

export default function DrawingRequestViewModal({
  request, onClose,
}: {
  request: DrawingRequest;
  onClose: () => void;
}) {
  const delay = delayDays(request);

  return (
    <Modal
      title="Drawing Request" subtitle={request.projectName} icon={PenTool}
      onClose={onClose}
      footer={<Btn label="Close" outline onClick={onClose} />}
    >
      <Descriptions>
        <DescItem label="Ticket No" span={2}><span className="font-mono font-bold text-purple-600 dark:text-purple-400">{request.ticketNo}</span></DescItem>
        <DescItem label="Project">{request.projectName}</DescItem>
        <DescItem label="Drawing Type">{request.drawingType}</DescItem>
        <DescItem label="Drawing Description" span={2}>{request.description}</DescItem>
        <DescItem label="Source">{request.source}</DescItem>
        <DescItem label="Requested By (DRI)">{request.driName}</DescItem>
        <DescItem label="Request Date">{dayjs(request.createdAt).format("DD MMM YYYY, hh:mm A")}</DescItem>
        <DescItem label="Assigned To">{request.assignedTo?.name}</DescItem>
        <DescItem label="Priority">{request.priority ? <Badge color={PRIORITY_COLOR[request.priority]} small>{PRIORITY_LABEL[request.priority]}</Badge> : undefined}</DescItem>
        <DescItem label="Status"><Badge color={STATUS_COLOR[request.status]} small>{STATUS_LABEL[request.status]}</Badge></DescItem>
        <DescItem label="Committed Date">{request.committedDate ? dayjs(request.committedDate).format("DD MMM YYYY") : undefined}</DescItem>
        <DescItem label="Actual Completion">{request.actualCompletionDate ? dayjs(request.actualCompletionDate).format("DD MMM YYYY") : undefined}</DescItem>
        <DescItem label="Delay (Days)">{delay !== null ? (delay > 0 ? `+${delay}` : `${delay}`) : undefined}</DescItem>
        <DescItem label="Planning Verified">{request.planningVerified ? "Yes" : "No"}</DescItem>
        <DescItem label="Project Acknowledged">{request.projectAcknowledged ? "Yes" : "No"}</DescItem>
        {request.remarks && <DescItem label="Remarks" span={2}>{request.remarks}</DescItem>}
      </Descriptions>
    </Modal>
  );
}
