'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, PageTitle } from '@/components/UI';
import { formatKstDateTime } from '@/lib/format';

type InquiryDetail = {
  inquiryId: string;
  title: string;
  content: string;
  nickname: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED';
  adminReply: string | null;
  repliedAt: string | null;
  createdAt: string;
};

export default function SupportDetailPage() {
  const params = useParams<{ inquiryId: string }>();
  const router = useRouter();
  const [inquiry, setInquiry] = useState<InquiryDetail | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  async function load() {
    const res = await fetch(`/api/support/${params.inquiryId}`);
    const data = await res.json();
    if (res.ok) {
      setInquiry(data.inquiry);
      setIsAdmin(data.isAdmin);
    } else {
      setError(data.error ?? '문의를 불러올 수 없어요.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.inquiryId]);

  async function submitReply() {
    if (!reply.trim()) return;
    setSubmittingReply(true);
    try {
      const res = await fetch(`/api/support/${params.inquiryId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: reply.trim() })
      });
      if (res.ok) {
        setReply('');
        load();
      }
    } finally {
      setSubmittingReply(false);
    }
  }

  if (error) {
    return (
      <div>
        <PageTitle title="고객센터" />
        <Card>
          <p className="field-error">{error}</p>
          <button className="ghost-btn" onClick={() => router.push('/support')}>
            ← 목록으로
          </button>
        </Card>
      </div>
    );
  }

  if (!inquiry) {
    return (
      <div>
        <PageTitle title="고객센터" />
        <p className="muted">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div>
      <PageTitle title="고객센터" subtitle="1:1 문의 상세" />
      <Card className="support-detail-card">
        <div className="card-head">
          <h2>{inquiry.title}</h2>
        </div>
        <p className="muted">
          {inquiry.nickname} · {formatKstDateTime(inquiry.createdAt, {})}
        </p>
        <p className="support-detail-content">{inquiry.content}</p>

        {inquiry.adminReply && (
          <div className="support-admin-reply">
            <strong>운영자 답변</strong>
            <p>{inquiry.adminReply}</p>
            {inquiry.repliedAt && <span className="muted">{formatKstDateTime(inquiry.repliedAt, {})}</span>}
          </div>
        )}

        {isAdmin && !inquiry.adminReply && (
          <div className="support-reply-form">
            <label>
              답변 작성
              <textarea className="review-textarea" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="답변을 입력해주세요." />
            </label>
            <button className="primary-btn" disabled={submittingReply} onClick={submitReply}>
              {submittingReply ? '등록 중...' : '답변 등록'}
            </button>
          </div>
        )}

        <button className="ghost-btn" onClick={() => router.push('/support')} style={{ marginTop: 16 }}>
          ← 목록으로
        </button>
      </Card>
    </div>
  );
}
