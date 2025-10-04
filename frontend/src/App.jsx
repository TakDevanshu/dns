import { useState, useEffect } from 'react'
import Configuration from './components/configuration';
import AuthPage from './components/authpage';
import Dashboard from './components/dashboard';


function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showDashboard, setShowDashboard] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState(null);
   // API configuration
  const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      fetch(`${API_BASE_URL}/protected`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(response => {
        if (response.ok) {
          setIsAuthenticated(true);
          setShowDashboard(true);
        } else {
          localStorage.removeItem('authToken');
          setIsAuthenticated(false);
        }
      })
      .catch(() => {
        localStorage.removeItem('authToken');
        setIsAuthenticated(false);
      })
      .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleAuthSuccess = (token) => {
    setIsAuthenticated(true);
    setShowDashboard(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setIsAuthenticated(false);
    setShowDashboard(false);
    setSelectedDomain(null);
  };

  // Called from dashboard to go to config page for a domain
  const handleGoToConfig = (domain) => {
    setSelectedDomain(domain || null);
    setShowDashboard(false);
  };

  // Called from config page to go back to dashboard
  const handleGoToDashboard = () => {
    setShowDashboard(true);
    setSelectedDomain(null);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <AuthPage onAuthSuccess={handleAuthSuccess} />;
  }

  if (showDashboard) {
    return <Dashboard onGoToConfig={handleGoToConfig} />;
  }

  return <Configuration onLogout={handleLogout} selectedDomain={selectedDomain} onGoToDashboard={handleGoToDashboard} />;
}

export default App
