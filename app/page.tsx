export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 flex">

      <aside className="w-64 bg-slate-900 text-white p-6">
        <h1 className="text-2xl font-bold mb-8">🏠 HMO Vision AI</h1>

        <nav className="space-y-4">
          <div>📊 Dashboard</div>
          <div>🏡 New Analysis</div>
          <div>📁 Projects</div>
          <div>📄 Reports</div>
          <div>⚙ Settings</div>
        </nav>
      </aside>

      <section className="flex-1 p-10">
        <h2 className="text-4xl font-bold mb-6">
          Welcome to HMO Vision AI
        </h2>

        <div className="bg-white rounded-xl shadow p-8 border">
          <h3 className="text-2xl font-semibold mb-4">
            Start a New Property Analysis
          </h3>

          <div className="border-2 border-dashed rounded-xl p-12 text-center text-gray-500">
            📤 Drag & Drop Floor Plan Here
            <br /><br />
            or click to upload
          </div>
        </div>

        <div className="mt-8 bg-white rounded-xl shadow p-8 border">
          <h3 className="text-2xl font-semibold mb-4">
            Recent Projects
          </h3>

          <p className="text-gray-500">
            No projects yet.
          </p>
        </div>
      </section>

    </main>
  );
}
