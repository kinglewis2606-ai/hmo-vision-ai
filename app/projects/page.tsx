import { prisma } from "@/lib/prisma";

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <main className="min-h-screen bg-slate-100 p-10">
      <div className="max-w-5xl mx-auto">

        <h1 className="text-4xl font-bold mb-8">
          Projects
        </h1>

        {projects.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-8">
            <p className="text-gray-500">
              No projects yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-white rounded-xl shadow p-6"
              >
                <h2 className="text-2xl font-bold">
                  {project.address}
                </h2>

                <p className="text-gray-600 mt-2">
                  {project.propertyType}
                </p>

                <p className="mt-4">
                  Status: {project.status}
                </p>
              </div>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
