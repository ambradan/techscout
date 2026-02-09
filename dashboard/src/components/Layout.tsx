import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

interface LayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
}

export function Layout({ children, showSidebar = true }: LayoutProps) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/projects', label: 'Projects' },
    { path: '/settings', label: 'Settings' },
  ];

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div className="min-h-screen bg-white">
      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-zinc-50">
        <Link to="/projects" className="text-sm font-semibold text-zinc-900">
          TechScout
        </Link>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-zinc-600 hover:text-zinc-900"
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/20"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile menu */}
      <div
        className={`md:hidden fixed top-0 left-0 z-50 w-64 h-full bg-zinc-50 border-r border-zinc-200 transform transition-transform ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-zinc-200">
          <Link
            to="/projects"
            className="text-sm font-semibold text-zinc-900"
            onClick={() => setMobileMenuOpen(false)}
          >
            TechScout
          </Link>
        </div>
        <nav className="py-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`sidebar-item ${isActive(item.path) ? 'sidebar-item-active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {user && (
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-zinc-200">
            <div className="text-xs text-zinc-500 mb-2 truncate">{user.email}</div>
            <button
              onClick={() => {
                signOut();
                setMobileMenuOpen(false);
              }}
              className="text-sm text-zinc-600 hover:text-zinc-900"
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      <div className="flex">
        {/* Desktop sidebar */}
        {showSidebar && (
          <aside className="sidebar hidden md:block flex-shrink-0">
            <div className="p-4 border-b border-zinc-200">
              <Link to="/projects" className="text-sm font-semibold text-zinc-900">
                TechScout
              </Link>
            </div>
            <nav className="py-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`sidebar-item ${isActive(item.path) ? 'sidebar-item-active' : ''}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            {user && (
              <div className="absolute bottom-0 left-0 w-52 p-4 border-t border-zinc-200 bg-zinc-50">
                <div className="text-xs text-zinc-500 mb-2 truncate">{user.email}</div>
                <button
                  onClick={signOut}
                  className="text-sm text-zinc-600 hover:text-zinc-900"
                >
                  Sign out
                </button>
              </div>
            )}
          </aside>
        )}

        {/* Main content */}
        <main className={`flex-1 min-h-screen ${showSidebar ? 'md:ml-0' : ''}`}>
          {children}
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-200 py-3 px-4 text-xs text-zinc-500 bg-zinc-50">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <span>TechScout - Technology Intelligence</span>
          <Link to="/privacy" className="hover:text-zinc-900">
            Privacy & Data
          </Link>
        </div>
      </footer>
    </div>
  );
}
