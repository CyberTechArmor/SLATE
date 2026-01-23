import { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Menu,
  X,
  Search,
  Plus,
  LogOut,
  Loader2,
  Paperclip,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { useInquiriesStore } from '../stores/inquiries';
import { useSocket } from '../hooks/useSocket';
import InquiryEditor from '../components/InquiryEditor';

function Logo({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle
        cx="24"
        cy="24"
        r="22"
        stroke="currentColor"
        strokeWidth="3"
        className="text-charcoal-900"
      />
      <text
        x="24"
        y="32"
        textAnchor="middle"
        className="text-charcoal-900"
        style={{ fontSize: '24px', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}
        fill="currentColor"
      >
        ?
      </text>
    </svg>
  );
}

export default function DashboardPage() {
  const { user, logout } = useAuthStore();
  const {
    inquiries,
    selectedId,
    isLoading,
    isSaving,
    error,
    fetchInquiries,
    createInquiry,
    selectInquiry,
    clearError,
  } = useInquiriesStore();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewInquiryForm, setShowNewInquiryForm] = useState(false);
  const [newInquiryTitle, setNewInquiryTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Set up WebSocket connection
  useSocket(!!user);

  // Fetch inquiries on mount
  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

  // Filter inquiries based on search
  const filteredInquiries = useMemo(() => {
    if (!searchQuery.trim()) return inquiries;
    const query = searchQuery.toLowerCase();
    return inquiries.filter((inquiry) =>
      inquiry.title.toLowerCase().includes(query)
    );
  }, [inquiries, searchQuery]);

  // Get selected inquiry
  const selectedInquiry = useMemo(() => {
    if (!selectedId) return null;
    return inquiries.find((i) => i.id === selectedId) || null;
  }, [inquiries, selectedId]);

  // Handle new inquiry creation
  const handleCreateInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInquiryTitle.trim()) return;

    setIsCreating(true);
    try {
      const inquiry = await createInquiry(newInquiryTitle.trim());
      setNewInquiryTitle('');
      setShowNewInquiryForm(false);
      selectInquiry(inquiry.id);
      setSidebarOpen(false);
    } catch {
      // Error handled in store
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelectInquiry = (id: string) => {
    selectInquiry(id);
    setSidebarOpen(false);
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="h-screen flex flex-col bg-charcoal-50">
      {/* Header */}
      <header className="h-16 bg-white border-b border-charcoal-200 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden btn-ghost p-2"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Logo className="w-8 h-8" />
          <span className="font-semibold text-charcoal-900 hidden sm:inline">
            Inquiry
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-charcoal-600 hidden sm:inline">
            Hello, <span className="font-medium">{user?.firstName}</span>
          </span>
          <button
            onClick={handleLogout}
            className="btn-ghost text-charcoal-600"
            title="Sign out"
          >
            <LogOut className="w-5 h-5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3 flex items-center justify-between">
          <span className="text-red-700 text-sm">{error}</span>
          <button
            onClick={clearError}
            className="text-red-600 hover:text-red-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`
            fixed lg:static inset-y-0 left-0 z-50 lg:z-auto
            w-80 bg-white border-r border-charcoal-200
            transform transition-transform duration-200 ease-in-out
            lg:transform-none
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            flex flex-col
          `}
        >
          {/* Sidebar Header */}
          <div className="p-4 border-b border-charcoal-200">
            <div className="flex items-center justify-between lg:hidden mb-4">
              <span className="font-semibold text-charcoal-900">Inquiries</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="btn-ghost p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search inquiries..."
                className="input pl-9"
              />
            </div>
          </div>

          {/* New Inquiry */}
          <div className="p-4 border-b border-charcoal-200">
            {showNewInquiryForm ? (
              <form onSubmit={handleCreateInquiry} className="space-y-2">
                <input
                  type="text"
                  value={newInquiryTitle}
                  onChange={(e) => setNewInquiryTitle(e.target.value)}
                  placeholder="Inquiry title..."
                  className="input"
                  autoFocus
                  maxLength={200}
                  disabled={isCreating}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewInquiryForm(false);
                      setNewInquiryTitle('');
                    }}
                    className="btn-secondary flex-1"
                    disabled={isCreating}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary flex-1"
                    disabled={isCreating || !newInquiryTitle.trim()}
                  >
                    {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                    Create
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowNewInquiryForm(true)}
                className="btn-primary w-full"
              >
                <Plus className="w-4 h-4" />
                New Inquiry
              </button>
            )}
          </div>

          {/* Inquiries List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-charcoal-400" />
              </div>
            ) : filteredInquiries.length === 0 ? (
              <div className="p-4 text-center text-charcoal-500">
                {searchQuery
                  ? 'No inquiries match your search'
                  : 'No inquiries yet. Create one to get started!'}
              </div>
            ) : (
              <ul className="divide-y divide-charcoal-100">
                {filteredInquiries.map((inquiry) => (
                  <li key={inquiry.id}>
                    <button
                      onClick={() => handleSelectInquiry(inquiry.id)}
                      className={`w-full text-left p-4 hover:bg-charcoal-50 transition-colors ${
                        selectedId === inquiry.id ? 'bg-charcoal-100' : ''
                      }`}
                    >
                      <div className="font-medium text-charcoal-900 truncate">
                        {inquiry.title}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-sm text-charcoal-500">
                        <span>
                          {format(new Date(inquiry.updatedAt), 'MMM d, yyyy')}
                        </span>
                        {inquiry.resources.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Paperclip className="w-3 h-3" />
                            {inquiry.resources.length}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 bg-white overflow-hidden">
          {selectedInquiry ? (
            <InquiryEditor inquiry={selectedInquiry} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-charcoal-400">
              <Logo className="w-16 h-16 opacity-30" />
              <p className="mt-4 text-lg">Select an inquiry</p>
              <p className="text-sm">
                Choose an inquiry from the sidebar or create a new one
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Saving indicator */}
      {isSaving && (
        <div className="fixed bottom-4 right-4 bg-charcoal-900 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Saving...
        </div>
      )}
    </div>
  );
}
