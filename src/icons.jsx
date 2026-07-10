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

export function CategoryIcon({ name = "other", size = 20 }) {
  const props = { ...iconProps, width: size, height: size };
  const iconPaths = {
    food: <><path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10" /><path d="M15 3v18M15 3c3 1 5 3 5 6h-5" /></>,
    transport: <><path d="m5 17-1 3M19 17l1 3" /><path d="M3 13l2-6h14l2 6v5H3v-5Z" /><path d="M7 18v2M17 18v2M7 13h.01M17 13h.01" /></>,
    shopping: <><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
    water: <path d="M12 3s6 6.1 6 11a6 6 0 0 1-12 0c0-4.9 6-11 6-11Z" />,
    fun: <><path d="M5 9h14a2 2 0 0 1 2 2v5a3 3 0 0 1-3 3c-2 0-2.5-1.5-6-1.5S8 19 6 19a3 3 0 0 1-3-3v-5a2 2 0 0 1 2-2Z" /><path d="M8 13v4M6 15h4M16 13h.01M18 16h.01" /></>,
    health: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 1 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
    study: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v17H6.5A2.5 2.5 0 0 0 4 22V5.5Z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v17h5.5A2.5 2.5 0 0 1 20 22V5.5Z" /></>,
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
    travel: <><circle cx="12" cy="12" r="9" /><path d="M3.5 9h17M3.5 15h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
    gift: <><path d="M4 10h16v11H4zM12 10v11M3 6h18v4H3z" /><path d="M12 6H8.5A2.5 2.5 0 1 1 11 3c0 1.6 1 3 1 3ZM12 6h3.5A2.5 2.5 0 1 0 13 3c0 1.6-1 3-1 3Z" /></>,
    tag: <><path d="M20 13 11 22l-8-8V4h10l7 9Z" /><circle cx="8" cy="8" r="1" /></>,
    other: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>
  };
  return <svg {...props}>{iconPaths[name] || iconPaths.other}</svg>;
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
