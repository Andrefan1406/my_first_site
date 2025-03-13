import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './HomePage';
import RequestPage from './RequestPage';
import ConcreteRequestPage from './ConcreteRequestPage'; 
import ElectricansRequestPage from './ElectricansRequestPage';
import GeoRequestPage from './GeoRequestPage';

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/request" element={<RequestPage />} />
        <Route path="/concrete-request" element={<ConcreteRequestPage />} />
        <Route path="/electricans-request" element={<ElectricansRequestPage />} />
        <Route path="/geo-request" element={<GeoRequestPage />} />
      </Routes>
    </Router>
  );
};

export default App;