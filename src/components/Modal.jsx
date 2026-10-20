import React, { useEffect, useId } from "react";
import { X } from "lucide-react";

// variant "dialog": centred card. variant "panel": slides in from the right on
// wide screens and fills the screen on phones (used for longer forms).
export default function Modal({
  title,
  subtitle,
  onClose,
  children,
  variant = "dialog",
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={`modal-backdrop ${variant}`} onMouseDown={onClose}>
      <div
        className={`modal ${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
