"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="ui-container py-24">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Temporary issue</p>
      <h1 className="mt-4 max-w-xl text-3xl font-semibold tracking-tight text-navy-950">
        This page could not load the property listings.
      </h1>
      <p className="mt-4 max-w-xl text-slate-600">A server error occurred. Reload to try again.</p>
      <button type="button" className="btn btn-primary mt-8" onClick={() => reset()}>
        Reload
      </button>
    </div>
  );
}
