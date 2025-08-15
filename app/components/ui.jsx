// app/components/ui.jsx
import { useEffect, useRef, useState } from "react";

/* ---------- Layout ---------- */
export function Shell({ title, subtitle, actions, children }) {
  return (
    <div className="grid gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function Card({ children, className="" }) {
  return <div className={`rounded-2xl border bg-white shadow-sm ${className}`}>{children}</div>;
}
export function Section({ title, children, className="" }) {
  return (
    <Card className={`p-5 ${className}`}>
      <div className="font-medium mb-3">{title}</div>
      {children}
    </Card>
  );
}

/* ---------- Inputs ---------- */
export function Button({ children, variant="primary", className="", ...props }) {
  const base = "px-4 py-2 rounded-xl text-sm transition disabled:opacity-50 disabled:cursor-not-allowed";
  const style = variant === "primary"
    ? "bg-sky-600 text-white hover:bg-sky-700"
    : variant === "danger"
    ? "bg-rose-600 text-white hover:bg-rose-700"
    : "bg-white border hover:bg-slate-50";
  return <button className={`${base} ${style} ${className}`} {...props}>{children}</button>;
}
export function Input({ label, type="text", value, onChange, placeholder, hint, error, className="" }) {
  return (
    <label className="text-sm grid gap-1">
      {label && <span className="text-slate-700">{label}</span>}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`px-3 py-2 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-sky-200 ${error ? "border-rose-400" : ""} ${className}`}
      />
      {hint && !error && <span className="text-xs text-slate-500">{hint}</span>}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </label>
  );
}
export function TextArea({ label, value, onChange, placeholder, hint, error, rows=4 }) {
  return (
    <label className="text-sm grid gap-1">
      {label && <span className="text-slate-700">{label}</span>}
      <textarea
        rows={rows}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`px-3 py-2 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-sky-200 ${error ? "border-rose-400" : ""}`}
      />
      {hint && !error && <span className="text-xs text-slate-500">{hint}</span>}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </label>
  );
}
export function Select({ label, value, onChange, children, hint, error }) {
  return (
    <label className="text-sm grid gap-1">
      {label && <span className="text-slate-700">{label}</span>}
      <select
        value={value}
        onChange={onChange}
        className={`px-3 py-2 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-sky-200 ${error ? "border-rose-400" : ""}`}
      >
        {children}
      </select>
      {hint && !error && <span className="text-xs text-slate-500">{hint}</span>}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </label>
  );
}
export function Checkbox({ label, checked, onChange }) {
  return (
    <label className="text-sm inline-flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} className="w-4 h-4 rounded border" />
      <span>{label}</span>
    </label>
  );
}
export function Badge({ children }) {
  return <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">{children}</span>;
}

/* ---------- Sticky bar & Toast ---------- */
export function StickyBar({ children }) {
  return (
    <div className="sticky bottom-4">
      <div className="max-w-6xl mx-auto">
        <div className="rounded-2xl border bg-white shadow-lg px-4 py-3 flex gap-2">{children}</div>
      </div>
    </div>
  );
}
export function useToast() {
  const [msg, setMsg] = useState(null);
  useEffect(()=>{
    if(!msg) return;
    const t = setTimeout(()=>setMsg(null), 2200);
    return ()=>clearTimeout(t);
  },[msg]);
  const Toast = () => msg ? (
    <div className="fixed bottom-6 right-6 z-50">
      <div className="rounded-xl bg-slate-900 text-white text-sm px-4 py-2 shadow-lg">{msg}</div>
    </div>
  ) : null;
  return { setMsg, Toast };
}

/* ---------- SearchableSelect (no-lib) ---------- */
export function SearchableSelect({ label, items=[], getLabel=(v)=>v, value, onChange, placeholder="พิมพ์ค้นหา..." }) {
  const [q,setQ] = useState("");
  const list = items.filter(it => getLabel(it).toLowerCase().includes(q.toLowerCase()));
  const ref = useRef(null);

  return (
    <div className="text-sm grid gap-1">
      {label && <span className="text-slate-700">{label}</span>}
      <input
        ref={ref}
        className="px-3 py-2 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
        placeholder={placeholder}
        value={q}
        onChange={e=>setQ(e.target.value)}
      />
      <div className="max-h-44 overflow-auto rounded-xl border">
        {list.length === 0 ? (
          <div className="px-3 py-2 text-slate-500">ไม่พบ</div>
        ) : list.map((it,idx)=>(
          <button
            key={idx}
            className={`w-full text-left px-3 py-2 hover:bg-sky-50 ${value===it ? "bg-sky-100" : ""}`}
            onClick={()=>onChange(it)}
          >
            {getLabel(it)}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Utils ---------- */
export function copy(text){ navigator.clipboard?.writeText(text); }
export function uid(){ try{return crypto.randomUUID()}catch{ return Math.random().toString(36).slice(2)+Date.now().toString(36); } }