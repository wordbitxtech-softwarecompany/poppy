"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-white text-slate-900">
        <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-24">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Temporary issue</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">This page could not load.</h1>
          <p className="mt-4 text-slate-600">A server error occurred. Reload to try again.</p>
          <button
            type="button"
            className="mt-8 inline-flex w-fit rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white"
            onClick={() => reset()}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
