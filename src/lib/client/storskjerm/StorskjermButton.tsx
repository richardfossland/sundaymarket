"use client";

import { useState } from "react";
import { StorskjermPanel } from "./StorskjermPanel";
import { tekst } from "./tekst";
import "./storskjerm.css";

/** «Vis på storskjerm» — liten knapp som åpner veiviseren (panelet). Sitter på
 * vertssiden og peker på storskjerm-ruta (`projectorPath`). */
export function StorskjermButton({ projectorPath }: { projectorPath: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="storskjerm-btn storskjerm-knapp"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">▶︎</span> {tekst.knapp}
      </button>
      {open && <StorskjermPanel projectorPath={projectorPath} onClose={() => setOpen(false)} />}
    </>
  );
}
