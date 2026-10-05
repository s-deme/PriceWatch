'use client';
import { useState } from 'react';
import { yen } from '../lib/format';
type Series = {
  name: string;
  points: { date: string; price: number | null }[];
};
export function HistoryChart({ series }: { series: Series[] }) {
  const [period, setPeriod] = useState('90');
  const [selected, setSelected] = useState(0);
  const [now] = useState(() => Date.now());
  const points = (series[selected]?.points ?? []).filter(
    (p) =>
      period === 'all' || +new Date(p.date) >= now - Number(period) * 86400000,
  );
  const available = points.filter(
    (p): p is { date: string; price: number } => p.price !== null,
  );
  const min = available.length
    ? Math.min(...available.map((p) => p.price)) * 0.95
    : 0;
  const max = available.length
    ? Math.max(...available.map((p) => p.price)) * 1.03
    : 1;
  const range = max - min || 1;
  const start = points.length ? +new Date(points[0].date) : 0;
  const end = points.length ? +new Date(points.at(-1)!.date) : 1;
  const x = (date: string) =>
    60 + ((+new Date(date) - start) / (end - start || 1)) * 790;
  const y = (price: number) => 220 - ((price - min) / range) * 185;
  const paths: string[] = [];
  let path = '';
  let last = 0;
  for (const p of points) {
    const stamp = +new Date(p.date);
    if (p.price === null || stamp - last > 2 * 86400000) {
      if (path) paths.push(path);
      path = '';
    }
    if (p.price !== null)
      path += `${path ? ' L' : 'M'}${x(p.date)},${y(p.price)}`;
    last = stamp;
  }
  if (path) paths.push(path);
  return (
    <div>
      <div className="chart-controls">
        <div className="tabs">
          {[
            ['7', '7日'],
            ['30', '30日'],
            ['90', '90日'],
            ['365', '1年'],
            ['all', '全期間'],
          ].map(([v, label]) => (
            <button
              key={v}
              className={period === v ? 'active' : ''}
              onClick={() => setPeriod(v)}
              aria-pressed={period === v}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          ショップ
          <select
            value={selected}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            {series.map((s, i) => (
              <option key={s.name} value={i}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {available.length ? (
        <>
          <svg
            className="history-chart"
            viewBox="0 0 900 270"
            role="img"
            aria-label={`${series[selected].name}の価格履歴。最低${yen(Math.min(...available.map((p) => p.price)))}、最高${yen(Math.max(...available.map((p) => p.price)))}`}
          >
            <title>送料込み支払価格の推移</title>
            {[0, 0.5, 1].map((t) => (
              <g key={t}>
                <line
                  x1="60"
                  x2="860"
                  y1={35 + t * 185}
                  y2={35 + t * 185}
                  stroke="var(--outline-variant)"
                />
                <text x="2" y={40 + t * 185} fontSize="12" fill="var(--muted)">
                  {yen(Math.round(max - t * range))}
                </text>
              </g>
            ))}
            {paths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="3"
              />
            ))}
            {available.length === 1 && (
              <circle
                cx={x(available[0].date)}
                cy={y(available[0].price)}
                r="5"
                fill="var(--primary)"
              />
            )}
            <text x="60" y="255" fontSize="12" fill="var(--muted)">
              {new Date(points[0].date).toLocaleDateString('ja-JP', {
                timeZone: 'Asia/Tokyo',
              })}
            </text>
            <text x="760" y="255" fontSize="12" fill="var(--muted)">
              {new Date(points.at(-1)!.date).toLocaleDateString('ja-JP', {
                timeZone: 'Asia/Tokyo',
              })}
            </text>
          </svg>
          <details>
            <summary>価格履歴を表で確認（{points.length}件）</summary>
            <div className="table-scroll history-table">
              <table>
                <thead>
                  <tr>
                    <th>観測日</th>
                    <th>支払価格</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.date}>
                      <td>
                        {new Date(p.date).toLocaleString('ja-JP', {
                          timeZone: 'Asia/Tokyo',
                        })}
                      </td>
                      <td>{yen(p.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <div className="empty">この期間の価格履歴はありません。</div>
      )}
      <p className="tiny">
        送料込み・ポイント控除前。48時間を超える観測の空白は線をつなぎません。
      </p>
    </div>
  );
}
