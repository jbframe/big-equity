import { Navigate, Route, Routes } from "react-router-dom";

import App from "./App";
import Layout from "./Layout";
import SettingsPage from "./SettingsPage";

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<App />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
