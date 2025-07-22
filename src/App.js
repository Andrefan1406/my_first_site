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
import ConcreteProductionReport from './ConcreteProductionReport';
import ConcreteRequestPage2 from './ConcreteRequestPage2'; 
/* import ConcreteRequestPage3 from './ConcreteRequestPage3';  */
import BLBRequestPage from './BLBRequestPage';
/* import TestRequestPage from './TestRequestPage'; */


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
        <Route path="/concrete-report" element={<ConcreteProductionReport />} />
        <Route path="/concrete-request2" element={<ConcreteRequestPage2 />} />
        {/* <Route path="/concrete-request3" element={<ConcreteRequestPage3 />} /> */}
        <Route path="/blbrequest" element={<BLBRequestPage />} />
       {/*  <Route path="/testrequest" element={<TestRequestPage />} /> */}
      </Routes>
    </Router>
  );
};

export default App;