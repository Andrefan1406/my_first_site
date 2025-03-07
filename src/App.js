import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './HomePage';
import RequestPage from './RequestPage';
import ConcreteRequestPage from './ConcreteRequestPage'; 

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/request" element={<RequestPage />} />
        <Route path="/concrete-request" element={<ConcreteRequestPage />} />
      </Routes>
    </Router>
  );
};

export default App;