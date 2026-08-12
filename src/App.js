import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import HomePage from './HomePage';
import RequestPage from './RequestPage';
import ElectricansRequestPage from './ElectricansRequestPage';
import GeoRequestPage from './GeoRequestPage';
import PeopleReportPage from './PeopleReportPage';
import ReportsDashboardPage from './ReportsDashboardPage';
import PeopleDashboardPage from './PeopleDashboardPage';
import EquipmentReportPage from './EquipmentReportPage';
import PeopleReportCharts from './PeopleReportCharts';
import ConcreteProductionReport from './ConcreteProductionReport';
import ConcreteDailyReportPage from './ConcreteDailyReportPage';
import ConcreteRequestPage from './ConcreteRequestPage';
import ConcreteChatPage from './pages/ConcreteChatPage';
import BLBRequestPage from './BLBRequestPage';
import ZnbRequestPage from './ZnbRequestPage';
import LabTestRequestPaje from "./LabTestRequestPaje";
import DefectActPage from "./pages/DefectActPage";
import GrafikiPage from "./pages/GrafikiPage";
import GprPosition64Page from "./pages/GprPosition64Page";
import GprBuilderPage from "./pages/GprBuilderPage";
import RemarksPage from "./remarks/RemarksPage";

import SmartRequestPage from './SmartRequestPage';
import LoginPage from './LoginPage';
import PrivateRoute from './components/PrivateRoute';
import AdminRoute from './components/AdminRoute';
import PeopleGapsGuard from './components/PeopleGapsGuard';
import PageTracker from './components/PageTracker';
import AdminStatistics from "./pages/AdminStatistics";
import PeopleGapsAdminPage from "./pages/PeopleGapsAdminPage";
import PeopleGapsUsersAdminPage from "./pages/PeopleGapsUsersAdminPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import ConcreteDashboardPage from "./pages/ConcreteDashboardPage";


const Protected = ({ children }) => (
  <PrivateRoute>
    {children}
  </PrivateRoute>
);

const App = () => {
  return (
    <Router>
      <PageTracker />
      <Routes>

        {/* Авторизация */}
        <Route path="/login" element={<LoginPage />} />

        {/* Главная */}
        <Route path="/" element={<Protected><HomePage /></Protected>} />

        {/* Заявки */}
        <Route
          path="/request"
          element={
            <Protected>
              <PeopleGapsGuard>
                <RequestPage />
              </PeopleGapsGuard>
            </Protected>
          }
        />

        <Route
          path="/electricans-request"
          element={
            <Protected>
              <PeopleGapsGuard>
                <ElectricansRequestPage />
              </PeopleGapsGuard>
            </Protected>
          }
        />

        <Route
          path="/geo-request"
          element={
            <Protected>
              <PeopleGapsGuard>
                <GeoRequestPage />
              </PeopleGapsGuard>
            </Protected>
          }
        />

        <Route
          path="/concrete-request"
          element={
            <Protected>
              <PeopleGapsGuard>
                <ConcreteRequestPage />
              </PeopleGapsGuard>
            </Protected>
          }
        />

        <Route
          path="/blbrequest"
          element={
            <Protected>
              <PeopleGapsGuard>
                <BLBRequestPage />
              </PeopleGapsGuard>
            </Protected>
          }
        />

        <Route
          path="/znbrequest"
          element={
            <Protected>
              <PeopleGapsGuard>
                <ZnbRequestPage />
              </PeopleGapsGuard>
            </Protected>
          }
        />

        <Route
          path="/lab-request"
          element={
            <Protected>
              <PeopleGapsGuard>
                <LabTestRequestPaje />
              </PeopleGapsGuard>
            </Protected>
          }
        />

        {/* Отчёты */}
        <Route
          path="/people-report"
          element={
            <Protected>
              <PeopleReportPage />
            </Protected>
          }
        />

        <Route
          path="/reports-dashboard"
          element={
            <Protected>
              <ReportsDashboardPage />
            </Protected>
          }
        />

        <Route
          path="/people-dashboard"
          element={
            <Protected>
              <PeopleDashboardPage />
            </Protected>
          }
        />

        <Route
          path="/equipment-report"
          element={
            <Protected>
              <EquipmentReportPage />
            </Protected>
          }
        />

        <Route path="/people-charts" element={<Protected><PeopleReportCharts /></Protected>}/>

        <Route
          path="/concrete-report"
          element={
            <Protected>
              <ConcreteProductionReport />
            </Protected>
          }
        />

        <Route
          path="/concrete-daily-report"
          element={
            <Protected>
              <ConcreteDailyReportPage />
            </Protected>
          }
        />

        <Route
          path="/concrete-chat"
          element={
            <Protected>
              <ConcreteChatPage />
            </Protected>
          }
        />

        <Route
          path="/concrete-dashboard"
          element={
            <Protected>
              <ConcreteDashboardPage />
            </Protected>
          }
        />

        {/* Прочее */}
        <Route
          path="/remarks"
          element={
            <Protected>
              <RemarksPage />
            </Protected>
          }
        />
        <Route
          path="/def-act"
          element={
            <Protected>
              <DefectActPage />
            </Protected>
          }
        />
        <Route
          path="/grafiki"
          element={
            <Protected>
              <GrafikiPage />
            </Protected>
          }
        />
        {/* Пока без ссылки/кнопки перехода откуда-либо — только прямой URL,
            по явной просьбе (см. историю чата про ветку work-schedule-charts). */}
        <Route
          path="/gpr-64"
          element={
            <Protected>
              <GprPosition64Page />
            </Protected>
          }
        />
        <Route
          path="/gpr-builder"
          element={
            <Protected>
              <GprBuilderPage />
            </Protected>
          }
        />
        <Route
          path="/admin"
          element={
            <Protected>
              <AdminRoute>
                <AdminDashboardPage />
              </AdminRoute>
            </Protected>
          }
        />
        <Route
          path="/admin/statistics"
          element={
            <Protected>
              <AdminStatistics />
            </Protected>
          }
        />
        <Route
          path="/admin/people-gaps"
          element={
            <Protected>
              <AdminRoute>
                <PeopleGapsAdminPage />
              </AdminRoute>
            </Protected>
          }
        />
        <Route
          path="/admin/users"
          element={
            <Protected>
              <AdminRoute>
                <PeopleGapsUsersAdminPage />
              </AdminRoute>
            </Protected>
          }
        />
        <Route
          path="/smart-request"
          element={
            <Protected>
              <SmartRequestPage />
            </Protected>
          }
        />
      </Routes>
    </Router>
  );
};

export default App;