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
import BLBRequestPage from './BLBRequestPage';
import ZnbRequestPage from './ZnbRequestPage';
import RagPage from './RagPage';
import RemarksPage from "./remarks/RemarksPage";
import LabTestRequestPaje from "./LabTestRequestPaje";
import DefectActPage from "./pages/DefectActPage";
import GrafikiPage from "./pages/GrafikiPage";

import LoginPage from './LoginPage';
import PrivateRoute from './components/PrivateRoute';
import PageTracker from './components/PageTracker';
import AdminStatistics from "./pages/AdminStatistics";


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
        <Route
          path="/"
          element={
            <Protected>
              <HomePage />
            </Protected>
          }
        />

        {/* Заявки */}
        <Route
          path="/request"
          element={
            <Protected>
              <RequestPage />
            </Protected>
          }
        />

        <Route
          path="/electricans-request"
          element={
            <Protected>
              <ElectricansRequestPage />
            </Protected>
          }
        />

        <Route
          path="/geo-request"
          element={
            <Protected>
              <GeoRequestPage />
            </Protected>
          }
        />

        <Route
          path="/concrete-request"
          element={
            <Protected>
              <ConcreteRequestPage />
            </Protected>
          }
        />

        <Route
          path="/blbrequest"
          element={
            <Protected>
              <BLBRequestPage />
            </Protected>
          }
        />

        <Route
          path="/znbrequest"
          element={
            <Protected>
              <ZnbRequestPage />
            </Protected>
          }
        />

        <Route
          path="/lab-request"
          element={
            <Protected>
              <LabTestRequestPaje />
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

        <Route
          path="/people-charts"
          element={
            <Protected>
              <PeopleReportCharts />
            </Protected>
          }
        />

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

        {/* Прочее */}
        <Route
          path="/rag"
          element={
            <Protected>
              <RagPage />
            </Protected>
          }
        />

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
        <Route
          path="/admin/statistics"
          element={
            <Protected>
              <AdminStatistics />
            </Protected>
          }
        />
      </Routes>
    </Router>
  );
};

export default App;