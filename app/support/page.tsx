'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Card, PageTitle } from '@/components/UI';
import { useAuthModal } from '@/components/AuthModalContext';

type InquiryListItem = {
  inquiryId: string;
  title: string;
  nickname: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED';
  createdAt: string;
};

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  OPEN: { label: '답변 대기', className: 'inquiry-status-open' },
  ANSWERED: { label: '답변 완료', className: 'inquiry-status-answered' },
  CLOSED: { label: '종료', className: 'inquiry-status-closed' }
};

export default function SupportPage() {
  const { data: session } = useSession();
  const { openAuthModal } = useAuthModal();

  const [inquiries, setInquiries] = useState<InquiryListItem[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/support');
    if (res.ok) {
      const data = await res.json();
      setInquiries(data.inquiries);
    } else {
      setInquiries([]);
    }
  }, []);

  useEffect(() => {
    if (session?.user) load();
  }, [session?.user, load]);

  function handleWriteClick() {
    if (!session?.user) {
      openAuthModal();
      return;
    }
    setFormOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError('제목과 내용을 모두 입력해주세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content: content.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setTitle('');
        setContent('');
        setFormOpen(false);
        load();
      } else {
        setError(data.error ?? '등록에 실패했어요.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageTitle
        title="고객센터"
        subtitle="궁금한 점이나 불편한 점을 1:1로 문의해주세요. 문의 내용은 작성자 본인과 운영자만 볼 수 있어요."
        action={
          <button className="primary-btn" onClick={handleWriteClick}>
            + 문의하기
          </button>
        }
      />

      {formOpen && (
        <Card className="support-write-card">
          <form onSubmit={submit} className="auth-form">
            <label>
              제목
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder="문의 제목을 입력해주세요" />
            </label>
            <label>
              내용
              <textarea
                className="review-textarea"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="문의 내용을 자세히 적어주시면 답변에 도움이 돼요."
              />
            </label>
            {error && <p className="field-error">{error}</p>}
            <div className="support-write-actions">
              <button type="button" className="ghost-btn" onClick={() => setFormOpen(false)}>
                취소
              </button>
              <button type="submit" className="primary-btn" disabled={submitting}>
                {submitting ? '등록 중...' : '등록하기'}
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card className="support-list-card">
        <div className="card-head">
          <h2>
            문의 목록 <span className="muted">{inquiries?.length ?? 0}건</span>
          </h2>
        </div>
        {!session?.user ? (
          <p className="muted">로그인하면 문의 목록을 볼 수 있어요.</p>
        ) : inquiries === null ? (
          <p className="muted">불러오는 중...</p>
        ) : inquiries.length === 0 ? (
          <p className="muted">등록된 문의가 없어요.</p>
        ) : (
          <table className="support-table">
            <thead>
              <tr>
                <th>제목</th>
                <th>작성자</th>
                <th>상태</th>
                <th>작성일</th>
              </tr>
            </thead>
            <tbody>
              {inquiries.map((inquiry) => {
                const status = STATUS_LABEL[inquiry.status] ?? STATUS_LABEL.OPEN;
                return (
                  <tr key={inquiry.inquiryId}>
                    <td>
                      <Link href={`/support/${inquiry.inquiryId}`} className="support-title-link">
                        {inquiry.title}
                      </Link>
                    </td>
                    <td>{inquiry.nickname}</td>
                    <td>
                      <span className={`inquiry-status-badge ${status.className}`}>{status.label}</span>
                    </td>
                    <td>{new Date(inquiry.createdAt).toLocaleDateString('ko-KR')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
