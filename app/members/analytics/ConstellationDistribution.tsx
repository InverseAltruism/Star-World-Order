'use client';

import React from 'react';
import { CONSTELLATION_RARITY } from '@/lib/starSkrumpey';
import { getVariantColor, getVariantTextStyle, isRareVariant } from '../shared';

/**
 * Constellation Distribution Component
 * Shows the correct distribution of all 333 Star Skrumpeys by constellation type
 * Uses static CONSTELLATION_RARITY data from lib/starSkrumpey.ts which is the authoritative source
 */
export default function ConstellationDistribution({
  isLoading
}: {
  isLoading: boolean;
}) {
  // Use the correct static constellation rarity data from CONSTELLATION_RARITY
  // See lib/starSkrumpey.ts for the authoritative source of these counts
  const sortedData = React.useMemo(() => {
    return Object.entries(CONSTELLATION_RARITY)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, []);

  const total = 333; // Total Star Skrumpeys

  // Chart dimensions
  const size = 240;
  const center = size / 2;
  const radius = 90;
  const innerRadius = 55;

  // Generate donut segments
  const segments = React.useMemo(() => {
    let currentAngle = -90; // Start from top
    return sortedData.map(({ name, count }) => {
      const angle = (count / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      // Calculate arc path
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const x1 = center + radius * Math.cos(startRad);
      const y1 = center + radius * Math.sin(startRad);
      const x2 = center + radius * Math.cos(endRad);
      const y2 = center + radius * Math.sin(endRad);

      const ix1 = center + innerRadius * Math.cos(startRad);
      const iy1 = center + innerRadius * Math.sin(startRad);
      const ix2 = center + innerRadius * Math.cos(endRad);
      const iy2 = center + innerRadius * Math.sin(endRad);

      const largeArc = angle > 180 ? 1 : 0;

      const path = `
        M ${ix1} ${iy1}
        L ${x1} ${y1}
        A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}
        L ${ix2} ${iy2}
        A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1}
        Z
      `;

      return {
        name,
        count,
        percentage: ((count / total) * 100).toFixed(1),
        path,
        color: getVariantColor(name),
      };
    });
  }, [sortedData]);

  return (
    <div className="pixel-card p-5 animate-slide-in-up">
      <h3 className="text-[#9966ff] text-sm sm:text-base tracking-wider mb-4">
        🌌 CONSTELLATION DISTRIBUTION
      </h3>
      <p className="text-gray-500 text-[10px] mb-4">
        Distribution of all 333 Star Skrumpeys across constellation types
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-3xl animate-spin">⭐</div>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row items-center gap-8">
          {/* Donut Chart */}
          <div className="relative flex-shrink-0">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              {segments.map((seg) => (
                <path
                  key={seg.name}
                  d={seg.path}
                  fill={seg.color}
                  stroke="#0a0a15"
                  strokeWidth="2"
                  style={{
                    filter: `drop-shadow(0 0 6px ${seg.color}40)`,
                    cursor: 'pointer',
                  }}
                  className="transition-all duration-200 hover:opacity-80 hover:scale-[1.02] origin-center"
                >
                  <title>{seg.name}: {seg.count} ({seg.percentage}%)</title>
                </path>
              ))}
              {/* Center text */}
              <text
                x={center}
                y={center - 10}
                textAnchor="middle"
                fill="#ffd700"
                fontSize="28"
                fontWeight="bold"
              >
                {total}
              </text>
              <text
                x={center}
                y={center + 12}
                textAnchor="middle"
                fill="#666"
                fontSize="11"
              >
                TOTAL STARS
              </text>
            </svg>
          </div>

          {/* Legend - Improved Grid Layout */}
          <div className="flex-1 w-full">
            <div className="grid grid-cols-2 gap-3">
              {sortedData.map(({ name, count }) => {
                const percentage = ((count / total) * 100).toFixed(1);
                const isRare = isRareVariant(name);
                return (
                  <div
                    key={name}
                    className={`flex items-center gap-3 p-2 rounded-lg bg-[#0a0a15]/50 border border-[#2a2a4e]/50 ${isRare ? 'ring-1 ring-[#ffd700]/30' : ''}`}
                  >
                    <div
                      className="w-5 h-5 rounded flex-shrink-0"
                      style={{
                        backgroundColor: getVariantColor(name),
                        boxShadow: `0 0 8px ${getVariantColor(name)}40`,
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span
                          className="text-xs font-bold capitalize"
                          style={getVariantTextStyle(name)}
                        >
                          {name}
                        </span>
                        {isRare && <span className="text-[8px]">✨</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-bold">{count}</span>
                        <span className="text-gray-500 text-[10px]">({percentage}%)</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
