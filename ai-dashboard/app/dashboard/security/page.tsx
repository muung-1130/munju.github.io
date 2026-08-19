"use client";
import { useEffect, useState } from "react";

export default function SecurityDashboard() {
  const [data, setData] = useState<{ cloudtrailEvents: any[]; vpcflowLines: string[] } | null>(null);

  useEffect(() => {
    fetch("/api/security-events").then(r => r.json()).then(setData);
  }, []);

  if (!data) return <div>불러오는 중...</div>;

  return (
    <div style={{ padding: 24 }}>
      <h2>CloudTrail 최근 이벤트</h2>
      <ul>
        {data.cloudtrailEvents.map((e, i) => (
          <li key={i}>{e.eventTime} — {e.eventName} ({e.eventSource}) by {e.userIdentity?.userName ?? e.userIdentity?.arn}</li>
        ))}
      </ul>
      <h2>VPC Flow Log 최근 기록</h2>
      <ul>
        {data.vpcflowLines.map((line, i) => (
          <li key={i} style={{ fontFamily: "monospace", fontSize: 12 }}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
