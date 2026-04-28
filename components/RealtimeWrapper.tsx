"use client";

import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useState } from "react";

export default function RealtimeWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [balance, setBalance] = useState(0);
  const [kycStatus, setKycStatus] = useState("");
  const [withdrawalFrozen, setWithdrawalFrozen] = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // 🔥 This is the instruction you were given
  useRealtimeSync({
    onNotification: (n) => {
      console.log("Notification:", n);
      // replace with your toast system if you have one
      alert(n.title);
      setUnreadCount((c) => c + 1);
    },
    onBalanceChange: (bal, pending) => {
      setBalance(bal);
    },
    onKycChange: (status, verified) => {
      setKycStatus(status);
    },
    onFreezeChange: (frozen, reason) => {
      setWithdrawalFrozen(frozen);
    },
    onAnnouncementChange: (anns) => {
      setAnnouncements(anns);
    },
    onSupportReply: (ticketId) => {
      console.log("New support reply:", ticketId);
      // call your refetchMessages if available
    },
  });

  return <>{children}</>;
}
