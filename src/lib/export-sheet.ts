// Export the schedule / standings as a shareable, nicely-templated sheet.
//  • PDF  → opens a print window (browser "Save as PDF"); paginates cleanly across days.
//  • PNG  → rasterises the same sheet off-screen with html-to-image and downloads it.
// bodyHtml is built by the caller (already HTML-escaped).

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

const CSS = `
.sheet{width:800px;margin:0 auto;background:#fff;color:#111827;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;padding:28px 32px;box-sizing:border-box}
.hd{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:3px solid #111827;padding-bottom:12px}
.hd .brand{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;font-weight:700}
.hd h1{font-size:26px;font-weight:900;margin:2px 0 0}
.hd .sub{font-size:13px;color:#374151;font-weight:700;margin-top:2px}
.hd .logo{width:46px;height:46px;border-radius:10px;background:#111827;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px}
.meta{font-size:12px;color:#4b5563;margin-top:8px}
.daygrp{margin-top:16px;break-inside:avoid}
.daygrp h2{font-size:13px;font-weight:900;background:#111827;color:#fff;padding:6px 10px;border-radius:6px;margin:0}
.divblk{margin-top:16px;break-inside:avoid}
.divblk h3{font-size:15px;font-weight:900;margin:0 0 6px}
.grpwrap{display:flex;flex-wrap:wrap;gap:12px}
.grp{border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;flex:1;min-width:300px}
.grp .gh{background:#f3f4f6;font-weight:800;font-size:12px;padding:5px 9px}
table{width:100%;border-collapse:collapse;font-size:12px}
.daygrp table{margin-top:6px}
th{text-align:left;color:#6b7280;font-weight:700;border-bottom:1px solid #e5e7eb;padding:4px 9px}
td{border-bottom:1px solid #f1f5f9;padding:5px 9px}
td.c{text-align:center}
.tt{font-weight:800}.tm{font-weight:700}
.vs{color:#9ca3af;font-weight:600}
.ko{margin-top:8px;font-size:12px}
.ko .kr{font-size:11px;font-weight:800;text-transform:uppercase;color:#6b7280;margin:8px 0 3px}
.ko .km{border:1px solid #e5e7eb;border-radius:6px;padding:4px 9px;margin-top:3px;font-weight:700;display:flex;justify-content:space-between}
.ft{margin-top:22px;border-top:1px solid #e5e7eb;padding-top:8px;font-size:10px;color:#9ca3af;text-align:center}
@media print{.sheet{width:auto}@page{margin:12mm}}
`;

function buildDoc(title: string, sub: string, meta: string, bodyHtml: string): string {
  const when = new Date().toLocaleString();
  return `<div class="sheet"><div class="hd"><div><div class="brand">BDC Vietnam</div><h1>${esc(title)}</h1><div class="sub">${esc(sub)}</div></div><div class="logo">B</div></div><div class="meta">${meta}</div>${bodyHtml}<div class="ft">Generated ${esc(when)} · BDC Scoreboard</div></div>`;
}

export function printSheet(title: string, sub: string, meta: string, bodyHtml: string) {
  const w = window.open("", "_blank");
  if (!w) { alert("Allow pop-ups to export the PDF."); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${buildDoc(title, sub, meta, bodyHtml)}</body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => w.print(), 350);
}

export async function imageSheet(title: string, sub: string, meta: string, bodyHtml: string, filename: string) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff";
  host.innerHTML = `<style>${CSS}</style>${buildDoc(title, sub, meta, bodyHtml)}`;
  document.body.appendChild(host);
  try {
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(host.querySelector(".sheet") as HTMLElement, { pixelRatio: 2, backgroundColor: "#ffffff" });
    const a = document.createElement("a"); a.href = dataUrl; a.download = filename; a.click();
  } finally { document.body.removeChild(host); }
}
