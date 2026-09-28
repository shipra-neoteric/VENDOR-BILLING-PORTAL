import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import apiClient from "../services/apiClient";

interface WorkOrderLinkProps {
  workOrderNo?: string;
  workOrderId?: string;
  onBeforeNavigate?: () => void;
  className?: string;
  // Path (e.g. "/bill-requests?open=<id>") to send the Work Order detail
  // page's Back button to, so it returns to this exact bill instead of the
  // default Work Orders list.
  returnTo?: string;
}

export default function WorkOrderLink({
  workOrderNo,
  workOrderId,
  onBeforeNavigate,
  className = "",
  returnTo,
}: WorkOrderLinkProps) {
  const navigate = useNavigate();
  const rawId =
    typeof workOrderId === "object"
      ? String((workOrderId as any)?._id || "")
      : workOrderId
      ? String(workOrderId)
      : "";
  const [resolvedId, setResolvedId] = useState<string>(rawId);

  useEffect(() => {
    const freshId =
      typeof workOrderId === "object"
        ? String((workOrderId as any)?._id || "")
        : workOrderId
        ? String(workOrderId)
        : "";
    if (freshId) {
      setResolvedId(freshId);
    } else if (workOrderNo && workOrderNo.trim()) {
      let cancelled = false;
      apiClient
        .get<{ workOrders?: Array<{ _id: string; workOrderNo: string }> }>("/work-orders", {
          params: { search: workOrderNo.trim() },
        })
        .then((res) => {
          if (cancelled) return;
          const match = (res.data?.workOrders || []).find(
            (w) => w.workOrderNo?.trim().toLowerCase() === workOrderNo.trim().toLowerCase()
          );
          if (match?._id) setResolvedId(match._id);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [workOrderId, workOrderNo]);

  if (!workOrderNo) return <span>—</span>;

  const targetId = resolvedId || rawId;
  const buildUrl = (id: string) =>
    returnTo ? `/work-items/${id}?returnTo=${encodeURIComponent(returnTo)}` : `/work-items/${id}`;

  const handleClick = async (e: React.MouseEvent) => {
    // If middle click, Ctrl-click, or Cmd-click, let the browser handle opening in a new tab naturally
    if (e.ctrlKey || e.metaKey || e.button === 1) return;
    e.preventDefault();
    if (targetId) {
      onBeforeNavigate?.();
      navigate(buildUrl(targetId));
      return;
    }
    // Fallback: If not resolved yet at click time, fetch directly
    try {
      const res = await apiClient.get<{ workOrders?: Array<{ _id: string; workOrderNo: string }> }>("/work-orders", {
        params: { search: workOrderNo.trim() },
      });
      const match = (res.data?.workOrders || []).find(
        (w) => w.workOrderNo?.trim().toLowerCase() === workOrderNo.trim().toLowerCase()
      );
      if (match?._id) {
        setResolvedId(match._id);
        onBeforeNavigate?.();
        navigate(buildUrl(match._id));
      } else {
        toast.error(`Could not find Work Order ${workOrderNo}`);
      }
    } catch {
      toast.error("Failed to open Work Order");
    }
  };

  return (
    <a
      href={targetId ? buildUrl(targetId) : "#"}
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 text-primary hover:underline font-semibold cursor-pointer group ${className}`}
      title={`Open Work Order ${workOrderNo}`}
    >
      <span>{workOrderNo}</span>
      <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity shrink-0" />
    </a>
  );
}
