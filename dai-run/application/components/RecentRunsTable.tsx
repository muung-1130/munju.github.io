import Link from 'next/link';
import { Card } from '@/components/UI';
import { formatPace } from '@/lib/runningRecord';
import { formatKstDateTime } from '@/lib/format';

type DetailedRun = {
  runId: string;
  startedAt: string;
  distanceM: number;
  durationSec: number;
  averagePaceSecPerKm: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  calories: number | null;
  elevationGainM: number | null;
  sourceType: string;
  courseId: string | null;
  courseName: string | null;
};

function formatDate(iso: string) {
  return formatKstDateTime(iso, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatDurationShort(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function RecentRunsTable({ runs }: { runs: DetailedRun[] }) {
  return (
    <Card id="running-records" className="mypage-runs-card">
      <div className="card-head">
        <h2>최근 러닝 기록</h2>
      </div>
      {runs.length === 0 ? (
        <p className="muted">아직 러닝 기록이 없어요.</p>
      ) : (
        <div className="mypage-runs-table-wrap">
          <table className="mypage-runs-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>코스</th>
                <th>거리</th>
                <th>시간</th>
                <th>페이스</th>
                <th>심박수</th>
                <th>칼로리</th>
                <th>상승고도</th>
                <th>기록 방식</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.runId}>
                  <td>{formatDate(run.startedAt)}</td>
                  <td>
                    {run.courseId ? (
                      <Link href={`/courses/${run.courseId}`} className="text-link">
                        {run.courseName ?? run.courseId}
                      </Link>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{(run.distanceM / 1000).toFixed(2)}km</td>
                  <td>{formatDurationShort(run.durationSec)}</td>
                  <td>{run.averagePaceSecPerKm ? `${formatPace(run.averagePaceSecPerKm)}/km` : '-'}</td>
                  <td>{run.averageHeartRate ? `${run.averageHeartRate}bpm` : '-'}</td>
                  <td>{run.calories ? `${run.calories}kcal` : '-'}</td>
                  <td>{run.elevationGainM ? `${Number(run.elevationGainM).toFixed(0)}m` : '-'}</td>
                  <td>{run.sourceType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
