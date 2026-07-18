import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth";
import Layout from "./components/Layout";
import SettingsPage from "./pages/SettingsPage";
import SimulatorPage from "./pages/SimulatorPage";

export default function AppRoutes() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<SimulatorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
