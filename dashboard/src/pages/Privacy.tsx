import { Link } from 'react-router-dom';

export function PrivacyPage() {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold text-zinc-900 mb-6">Privacy & Data Policy</h1>

      <div className="space-y-6 text-sm text-zinc-600">
        {/* Overview */}
        <section>
          <h2 className="text-base font-medium text-zinc-900 mb-2">What TechScout Collects</h2>
          <p className="mb-3">
            TechScout is designed with a strict data minimization principle. We only collect the
            metadata necessary to provide technology recommendations.
          </p>
          <div className="bg-green-50 border border-green-200 rounded-sm p-4">
            <h3 className="font-medium text-green-800 mb-2">What we DO collect:</h3>
            <ul className="list-disc list-inside text-green-700 space-y-1">
              <li>Dependency manifest files (package.json, requirements.txt, etc.)</li>
              <li>Language breakdown percentages</li>
              <li>Framework and library versions</li>
              <li>Repository topics and metadata</li>
              <li>Your feedback on recommendations</li>
            </ul>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-sm p-4 mt-3">
            <h3 className="font-medium text-red-800 mb-2">What we NEVER collect:</h3>
            <ul className="list-disc list-inside text-red-700 space-y-1">
              <li>Source code files (.ts, .js, .py, .go, etc.)</li>
              <li>Configuration files with secrets (.env, credentials)</li>
              <li>Internal business logic or algorithms</li>
              <li>Private repository contents beyond manifests</li>
            </ul>
          </div>
        </section>

        {/* Technical Implementation */}
        <section>
          <h2 className="text-base font-medium text-zinc-900 mb-2">Technical Safeguards</h2>
          <p className="mb-3">
            Our system enforces strict file whitelisting at the code level. The following files are
            the ONLY ones that can be fetched from your repository:
          </p>
          <div className="bg-zinc-50 border border-zinc-200 rounded-sm p-4 font-mono text-xs">
            <ul className="space-y-1">
              <li>package.json, package-lock.json, yarn.lock, pnpm-lock.yaml</li>
              <li>requirements.txt, pyproject.toml, Pipfile</li>
              <li>Cargo.toml</li>
              <li>go.mod, go.sum</li>
              <li>Gemfile, Gemfile.lock</li>
              <li>composer.json, composer.lock</li>
              <li>pubspec.yaml</li>
              <li>build.gradle, pom.xml</li>
              <li>mix.exs</li>
            </ul>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Any attempt to fetch a file not in this whitelist is blocked and logged as a security
            violation.
          </p>
        </section>

        {/* Data Storage */}
        <section>
          <h2 className="text-base font-medium text-zinc-900 mb-2">Where Data is Stored</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong>Database:</strong> Supabase (PostgreSQL) with Row Level Security (RLS) enabled.
              You can only access your own project data.
            </li>
            <li>
              <strong>Brief Archives:</strong> Supabase Storage with access controls.
            </li>
            <li>
              <strong>Logs:</strong> Minimal operational logs without sensitive data.
            </li>
          </ul>
        </section>

        {/* Analysis Process */}
        <section>
          <h2 className="text-base font-medium text-zinc-900 mb-2">What Gets Analyzed</h2>
          <p className="mb-3">
            When generating recommendations, only the following is sent for analysis:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Dependency names and versions (not file contents)</li>
            <li>Language percentages</li>
            <li>Framework identifiers</li>
            <li>Your declared pain points and objectives</li>
            <li>Technology information from public sources (HN, GitHub Trending, etc.)</li>
          </ul>
          <p className="mt-3">
            <strong>Source code is never sent to any analysis service.</strong>
          </p>
        </section>

        {/* Data Deletion */}
        <section>
          <h2 className="text-base font-medium text-zinc-900 mb-2">Deleting Your Data</h2>
          <p className="mb-3">
            You can delete all your project data at any time from the Settings page. This performs
            a cascade delete that removes:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Project configuration</li>
            <li>Stack and manifest data</li>
            <li>All recommendations and feedback</li>
            <li>Brief archives and history</li>
            <li>Code findings metadata</li>
          </ul>
          <p className="mt-3">
            Deletion is permanent and cannot be undone.
          </p>
        </section>

        {/* Contact */}
        <section>
          <h2 className="text-base font-medium text-zinc-900 mb-2">Questions?</h2>
          <p>
            If you have any questions about data handling, please contact your system administrator
            or review the source code — the whitelist enforcement is implemented in{' '}
            <code className="text-xs bg-zinc-100 px-1 py-0.5 rounded">src/providers/github.ts</code>.
          </p>
        </section>
      </div>

      <div className="mt-8 pt-4 border-t border-zinc-200">
        <Link to="/projects" className="text-sm text-blue-600 hover:text-blue-800">
          ← Back to Projects
        </Link>
      </div>
    </div>
  );
}
