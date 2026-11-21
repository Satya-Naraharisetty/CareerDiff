import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export const CareerDiffLogo: React.FC<LogoProps> = ({ className = 'h-4 w-4', size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Growth Delta (Δ) Outer Frame - Career Elevation & Positive Diff */}
    <path
      d="M12 3L21 19.5H3L12 3Z"
      stroke="#34d399"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Inner Navigation Vector - Upward Career Trajectory */}
    <path
      d="M8.25 15L12 9.5L15.75 15"
      stroke="#38bdf8"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Apex Precision Coordinate Node */}
    <circle cx="12" cy="9.5" r="1.1" fill="#38bdf8" />
  </svg>
);

export default CareerDiffLogo;

