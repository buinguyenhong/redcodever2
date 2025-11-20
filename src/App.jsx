import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './Login';
import Dashboard from './Dashboard';
import AlarmOverlay from './AlarmOverlay';
import Monitor from './Monitor';
import Reports from './Reports';
import { useOnlineHeartbeat } from './useOnlineHeartbeat';  

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-slate-500 font-medium">Đang kết nối máy chủ...</div>;
  return user ? children : <Navigate to="/login" />;
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user } = useAuth();
  useOnlineHeartbeat();  

  return (
    <>
      {user && <AlarmOverlay />}
      <Routes>
        <Route
          path="/monitor"
          element={
            <PrivateRoute>
              <Monitor />
            </PrivateRoute>
          }
        />

        <Route
          path="/reports"
          element={
            <PrivateRoute>
              <Reports />
            </PrivateRoute>
          }
        />

        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
      </Routes>
    </>
  );
}
