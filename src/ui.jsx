import React from "react";

/**
 * Small, dependency-free presentation primitives shared by the app screens.
 * Domain state stays in App.jsx; these components only describe layout.
 */
export function AppHeader({ eyebrow, title, action, className = "" }) {
  return (
    <header className={`screen-heading app-page-header ${className}`.trim()}>
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action}
    </header>
  );
}

export function Screen({ children, className = "", hidden = false }) {
  return (
    <div className={`screen ${className}`.trim()} hidden={hidden}>
      {children}
    </div>
  );
}
