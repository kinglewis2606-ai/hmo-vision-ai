import Link from "next/link";
export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 flex flex-col md:flex-row">

      <aside className="w-full md:w-64 bg-slate-900 text-white p-4 md:p-6">
        <h1 className="text-2xl font-bold mb-8">🏠 HMO Vision AI</h1>

        <nav className="space-y-4">
          <div>📊 Dashboard</div>
          <Link href="/new" className="block hover:text-blue-300">
  🏡 New Analysis
</Link>
          <div>📁 Projects</div>
          <div>📄 Reports</div>
          <div>⚙ Settings</div>
        </nav>
      </aside>

      <section className="flex-1 p-10">
        <h2 className="text-2xl md:text-4xl font-bold mb-6">
          Welcome to HMO Vision AI
        </h2>

        <div className="bg-white rounded-xl shadow p-8 border">
          <h3 className="text-2xl font-semibold mb-4">
            Start a New Property Analysis
          </h3>

          <div className="border-2 border-dashed rounded-xl p-12 text-center bg-slate-50">

  <h3 className="text-3xl font-bold mb-4">
    Ready to analyse a property?
  </h3>

  <p className="text-gray-600 mb-8">
    Upload a floor plan and let HMO Vision AI create investor-ready layouts.
  </p>

  <Link
    href="/new"
    className="block w-full md:w-auto rounded-xl bg-blue-600 px-8 py-4 text-center text-white font-bold hover:bg-blue-700"
  >
    🚀 Start New Analysis
    </Link>

</div>

</div>

<div className="mt-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

  <div className="bg-white rounded-xl shadow p-6 border">
    <p className="text-gray-500">Properties Analysed</p>
    <h2 className="text-4xl font-bold mt-2">0</h2>
  </div>

  <div className="bg-white rounded-xl shadow p-6 border">
    <p className="text-gray-500">Potential Bedrooms</p>
    <h2 className="text-4xl font-bold mt-2">0</h2>
  </div>

  <div className="bg-white rounded-xl shadow p-6 border">
    <p className="text-gray-500">Estimated ROI</p>
    <h2 className="text-4xl font-bold mt-2">--</h2>
  </div>

  <div className="bg-white rounded-xl shadow p-6 border">
    <p className="text-gray-500">Compliance Score</p>
    <h2 className="text-4xl font-bold mt-2">--</h2>
  </div>

</div>
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
