import React from "react";

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.1,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true
};

export function WalletIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H20v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" />
      <path d="M4 8h16" />
      <path d="M15.5 13.5h2" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ScanIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M8 20H5a1 1 0 0 1-1-1v-3M16 20h3a1 1 0 0 0 1-1v-3" />
      <path d="M7 12h10" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg {...iconProps}>
      <path d="M18 9a6 6 0 0 0-12 0c0 7-2 7-2 8h16c0-1-2-1-2-8" />
      <path d="M10 21h4" />
    </svg>
  );
}

export function ChartIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="m7 15 3-4 3 2 4-6" />
    </svg>
  );
}

export function UserIcon() {
  return (
    <svg {...iconProps}>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}

export function EditIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" />
    </svg>
  );
}

export function GripIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="8" cy="6" r="1" />
      <circle cx="16" cy="6" r="1" />
      <circle cx="8" cy="12" r="1" />
      <circle cx="16" cy="12" r="1" />
      <circle cx="8" cy="18" r="1" />
      <circle cx="16" cy="18" r="1" />
    </svg>
  );
}

export function UploadIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg {...iconProps}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}
