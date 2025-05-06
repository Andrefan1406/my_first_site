import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './HomePage';
import RequestPage from './RequestPage';
import ConcreteRequestPage from './ConcreteRequestPage'; 
import ElectricansRequestPage from './ElectricansRequestPage';
import GeoRequestPage from './GeoRequestPage';
import PeopleReportPage from './PeopleReportPage';
import ReportsDashboardPage from './ReportsDashboardPage';
import PeopleDashboardPage from './PeopleDashboardPage';
import EquipmentReportPage from './EquipmentReportPage';
import PeopleReportCharts from './PeopleReportCharts';

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/request" element={<RequestPage />} />
        <Route path="/concrete-request" element={<ConcreteRequestPage />} />
        <Route path="/electricans-request" element={<ElectricansRequestPage />} />
        <Route path="/geo-request" element={<GeoRequestPage />} />
        <Route path="/people-report" element={<PeopleReportPage />} />
        <Route path="/reports-dashboard" element={<ReportsDashboardPage />} />
        <Route path="/people-dashboard" element={<PeopleDashboardPage />} />
        <Route path="/equipment-report" element={<EquipmentReportPage />} />
        <Route path="/people-charts" element={<PeopleReportCharts />} />
      </Routes>
    </Router>
  );
};

export default App;