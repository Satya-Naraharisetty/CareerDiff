import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navbar } from './components/Navbar';
import { AuthModal } from './components/AuthModal';
import { InterviewSetup } from './components/InterviewSetup';
import { InterviewRoom } from './components/InterviewRoom';
import { DossierView } from './components/DossierView';
import { useInterviewStore } from './stores/interviewStore';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const AppContent: React.FC = () => {
  const [currentView, setCurrentView] = useState<'setup' | 'interview' | 'dossier'>('setup');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const { reset: resetInterview } = useInterviewStore();

  const handleStartInterview = () => {
    setCurrentView('interview');
  };

  const handleConcludeInterview = () => {
    setCurrentView('dossier');
  };

  const handleReset = () => {
    resetInterview();
    setCurrentView('setup');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      <Navbar
        onOpenAuth={() => setIsAuthOpen(true)}
        currentView={currentView}
        onNavigate={(view) => setCurrentView(view)}
      />

      <main className="flex-1">
        {currentView === 'setup' && (
          <InterviewSetup
            onStartInterview={handleStartInterview}
            onOpenAuth={() => setIsAuthOpen(true)}
          />
        )}

        {currentView === 'interview' && (
          <InterviewRoom onConclude={handleConcludeInterview} />
        )}

        {currentView === 'dossier' && (
          <DossierView onReset={handleReset} />
        )}
      </main>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </div>
  );
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
