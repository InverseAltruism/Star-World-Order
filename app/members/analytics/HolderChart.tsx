'use client';

import { useState } from 'react';
import { getVariantColor } from '../shared';
import { CONSTELLATION_OPTIONS } from './types';
import { useHolderStats } from './useHolderStats';

/**
 * Holder Chart - Displays Star Skrumpey holder count over time
 * Features:
 * - 1H / 1D / 1W time range toggle
 * - Constellation filter (All or specific)
 * - SVG line chart with gradient fill
 * - Zoom in/out capability
 * - Real-time data from database
 */
export default function HolderChart() {
  // Data fetch + polling (keyed on timeRange + constellation) lives in the hook.
  const {
    timeRange,
    setTimeRange,
    constellation,
    setConstellation,
    statsData,
    isLoading,
    error,
    refetch,
  } = useHolderStats();
  // Zoom is UI-only state, so it stays in the component.
  const [zoomLevel, setZoomLevel] = useState(1);

  // Chart dimensions - use aspect ratio 2:1 for better proportions
  const baseChartWidth = 400;
  const baseChartHeight = 200;
  const chartWidth = baseChartWidth * zoomLevel;
  const chartHeight = baseChartHeight * zoomLevel;
  const padding = { top: 20, right: 20, bottom: 40, left: 45 };

  // Calculate chart data
  const history = statsData?.history || [];
  const holderCounts = history.map(d => d.holderCount);
  const minCount = holderCounts.length > 0 ? Math.max(0, Math.min(...holderCounts) - 2) : 0;
  const maxCount = holderCounts.length > 0 ? Math.max(...holderCounts) + 2 : 10;
  const countRange = maxCount - minCount || 1;

  // Generate time labels for horizontal axis with proper date formatting
  const generateTimeLabels = () => {
    if (history.length < 2) return [];

    const labels: Array<{ x: number; label: string }> = [];
    const effectiveWidth = chartWidth - padding.left - padding.right;

    // Get number of labels based on time range
    const labelCount = zoomLevel >= 1.5 ? 7 : 5;

    for (let i = 0; i < labelCount; i++) {
      const dataIndex = Math.floor((i / (labelCount - 1)) * (history.length - 1));
      const timestamp = history[dataIndex]?.timestamp;

      if (timestamp) {
        const date = new Date(timestamp);
        let label: string;

        if (timeRange === '1H') {
          // For 1H time range: show hours and minutes
          label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (timeRange === '1D') {
          // For 1D time range: show month/day with time
          label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        } else {
          // For 1W time range: show full date
          label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }

        labels.push({
          x: padding.left + (i / (labelCount - 1)) * effectiveWidth,
          label
        });
      }
    }

    return labels;
  };

  // Generate SVG path for the line
  const generatePath = () => {
    if (history.length < 2) return '';

    const effectiveWidth = chartWidth - padding.left - padding.right;
    const effectiveHeight = chartHeight - padding.top - padding.bottom;

    const points = history.map((point, index) => {
      const x = padding.left + (index / (history.length - 1)) * effectiveWidth;
      const y = padding.top + effectiveHeight - ((point.holderCount - minCount) / countRange) * effectiveHeight;
      return { x, y };
    });

    // Create smooth curve
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      path += ` Q ${prev.x} ${curr.y} ${midX} ${(prev.y + curr.y) / 2}`;
    }
    if (points.length > 1) {
      const last = points[points.length - 1];
      path += ` L ${last.x} ${last.y}`;
    }

    return path;
  };

  // Generate area fill path
  const generateAreaPath = () => {
    if (history.length < 2) return '';

    const effectiveWidth = chartWidth - padding.left - padding.right;
    const effectiveHeight = chartHeight - padding.top - padding.bottom;
    const bottomY = padding.top + effectiveHeight;

    const points = history.map((point, index) => {
      const x = padding.left + (index / (history.length - 1)) * effectiveWidth;
      const y = padding.top + effectiveHeight - ((point.holderCount - minCount) / countRange) * effectiveHeight;
      return { x, y };
    });

    let path = `M ${points[0].x} ${bottomY}`;
    path += ` L ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      path += ` Q ${prev.x} ${curr.y} ${midX} ${(prev.y + curr.y) / 2}`;
    }

    if (points.length > 1) {
      const last = points[points.length - 1];
      path += ` L ${last.x} ${last.y}`;
      path += ` L ${last.x} ${bottomY}`;
    }
    path += ' Z';

    return path;
  };

  // Get color for selected constellation
  const chartColor = constellation === 'all' ? '#ffd700' : getVariantColor(constellation);
  const currentHolders = statsData?.currentHolders || 0;
  const timeLabels = generateTimeLabels();

  // Zoom handlers
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.5, 2.5));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.5, 1));

  return (
    <div className="pixel-card p-5 animate-slide-in-up">
      {/* Header with Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-[#ffd700] text-sm sm:text-base tracking-wider mb-1">
            👥 STAR SKRUMPEY HOLDERS
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-white text-2xl sm:text-3xl font-bold" style={{ color: chartColor }}>
              {isLoading ? '...' : currentHolders}
            </span>
            <span className="text-gray-500 text-xs">
              {constellation === 'all' ? 'UNIQUE HOLDERS' : `${constellation.toUpperCase()} HOLDERS`}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Constellation Dropdown */}
          <select
            value={constellation}
            onChange={(e) => setConstellation(e.target.value)}
            className="bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-2 py-1 text-xs text-white focus:border-[#ffd700] focus:outline-none cursor-pointer smooth-transition"
          >
            {CONSTELLATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Time Range Toggle */}
          <div className="flex gap-1">
            {(['1H', '1D', '1W'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeRange(tf)}
                className={`px-3 py-1 text-xs rounded border-2 smooth-transition ${
                  timeRange === tf
                    ? 'bg-[#ffd700]/20 border-[#ffd700] text-[#ffd700]'
                    : 'bg-transparent border-[#2a2a4e] text-gray-500 hover:border-[#ffd700]/50'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Zoom Controls */}
          <div className="flex gap-1 ml-2">
            <button
              onClick={handleZoomOut}
              disabled={zoomLevel <= 1}
              className="px-2 py-1 text-xs rounded border-2 border-[#2a2a4e] text-gray-400 hover:border-[#ffd700]/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed smooth-transition"
              title="Zoom Out"
            >
              −
            </button>
            <button
              onClick={handleZoomIn}
              disabled={zoomLevel >= 2.5}
              className="px-2 py-1 text-xs rounded border-2 border-[#2a2a4e] text-gray-400 hover:border-[#ffd700]/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed smooth-transition"
              title="Zoom In"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Chart Container with horizontal scroll for zoom */}
      <div
        className="relative w-full overflow-x-auto scrollbar-pixel"
        style={{ maxWidth: '100%' }}
      >
        <div style={{ width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%', aspectRatio: '2 / 1', minWidth: '300px' }}>
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-3xl animate-spin">⭐</div>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-[#ff4466] text-sm mb-2">{error}</p>
              <button
                onClick={refetch}
                className="text-[#ffd700] text-sm underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          ) : history.length < 2 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-4xl mb-2">📊</div>
              <p className="text-gray-500 text-sm text-center">
                Collecting data... First chart will appear
                <br />
                after multiple snapshots are recorded.
              </p>
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-full"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Grid lines */}
              <g stroke="#2a2a4e" strokeWidth="0.5">
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                  <line
                    key={ratio}
                    x1={padding.left}
                    y1={padding.top + (chartHeight - padding.top - padding.bottom) * ratio}
                    x2={chartWidth - padding.right}
                    y2={padding.top + (chartHeight - padding.top - padding.bottom) * ratio}
                  />
                ))}
              </g>

              {/* Y-axis labels */}
              <g fill="#888" fontSize="11" fontFamily="monospace">
                <text x={padding.left - 8} y={padding.top + 4} textAnchor="end">
                  {maxCount}
                </text>
                <text x={padding.left - 8} y={chartHeight - padding.bottom + 4} textAnchor="end">
                  {minCount}
                </text>
              </g>

              {/* X-axis time labels */}
              <g fill="#888" fontSize="10" fontFamily="monospace">
                {timeLabels.map((item, index) => (
                  <text
                    key={index}
                    x={item.x}
                    y={chartHeight - padding.bottom + 20}
                    textAnchor="middle"
                  >
                    {item.label}
                  </text>
                ))}
              </g>

              {/* Gradient definition */}
              <defs>
                <linearGradient id={`holderGradient-${constellation}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={chartColor} stopOpacity="0.4"/>
                  <stop offset="100%" stopColor={chartColor} stopOpacity="0"/>
                </linearGradient>
              </defs>

              {/* Area fill */}
              <path
                d={generateAreaPath()}
                fill={`url(#holderGradient-${constellation})`}
              />

              {/* Line */}
              <path
                d={generatePath()}
                fill="none"
                stroke={chartColor}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: `drop-shadow(0 0 4px ${chartColor})` }}
              />

              {/* Current value dot */}
              {history.length > 0 && (
                <circle
                  cx={chartWidth - padding.right}
                  cy={padding.top + (chartHeight - padding.top - padding.bottom) -
                     ((history[history.length - 1].holderCount - minCount) / countRange) *
                     (chartHeight - padding.top - padding.bottom)}
                  r="5"
                  fill={chartColor}
                  style={{ filter: `drop-shadow(0 0 6px ${chartColor})` }}
                />
              )}
            </svg>
          )}
        </div>
      </div>

      {/* Chart Info */}
      <div className="flex justify-between items-center mt-3 text-xs text-gray-500">
        <span>
          {timeRange === '1H' && 'Last 24 hours (hourly data)'}
          {timeRange === '1D' && 'Last 30 days (daily data)'}
          {timeRange === '1W' && 'Last 90 days (weekly data)'}
        </span>
        {statsData?.lastUpdated && !isLoading && (
          <span>
            Updated {new Date(statsData.lastUpdated).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
