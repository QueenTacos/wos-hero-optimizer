export default function SavedResultsPage() {
  return (
    <div className="card">
      <h2 className="font-semibold mb-2">Saved Results</h2>
      <p className="text-sm text-slate-400">
        Saved/shareable optimization results are planned for Phase 4 (local persistence via IndexedDB, with
        optional cloud sync). For now, run a fresh optimization from the Optimize tab each session.
      </p>
    </div>
  );
}
