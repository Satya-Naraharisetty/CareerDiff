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
    {/* Left Terminal Convergent Arm */}
    <path
      d="M4.5 4.5L10.5 12L4.5 19.5"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Right Terminal Convergent Arm */}
    <path
      d="M19.5 4.5L13.5 12L19.5 19.5"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Central Precision Deterministic Node */}
    <circle cx="12" cy="12" r="1.75" fill="#34d399" />
  </svg>
);

export default CareerDiffLogo;

