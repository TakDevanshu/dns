import React, { useEffect, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";

const Dashboard = ({ onGoToConfig }) => {
  const [domains, setDomains] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [tab, setTab] = useState("details");
  const [domainDetails, setDomainDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const userId = localStorage.getItem("userId");
  const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
  const getAuthToken = () => localStorage.getItem("authToken");

  const apiCall = async (endpoint, options = {}) => {
    try {
      const token = getAuthToken();
      const headers = {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      };
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }
      return await response.json();
    } catch (error) {
      setError(error.message);
      throw error;
    }
  };

  useEffect(() => {
    const fetchDomains = async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await apiCall(`/domains/user/${userId}`);
        if (resp.success && resp.data.domains.length > 0) {
          setDomains(resp.data.domains);
          setSelectedDomain(resp.data.domains[0]);
        } else {
          setDomains([]);
          setSelectedDomain("");
        }
      } catch (e) {}
      setLoading(false);
    };
    fetchDomains();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const fetchDomainDetails = async () => {
      if (!selectedDomain) {
        setDomainDetails(null);
        return;
      }
      setLoading(true);
      setError("");
      try {
        // Assuming /domains/:domain returns all details, contacts, and name servers
        const resp = await apiCall(`/domains/${selectedDomain}`);
        if (resp.success) {
          setDomainDetails(resp.data);
        } else {
          setDomainDetails(null);
        }
      } catch (e) {
        setDomainDetails(null);
      }
      setLoading(false);
    };
    fetchDomainDetails();
    // eslint-disable-next-line
  }, [selectedDomain]);

  return (
    <div className="container py-5">
      <style>
        {`
          :root {
              /* Professional Red Color Palette */
              --primary-red: #CB2D3E;       /* Main brand red */
              --dark-red: #8B1E2B;          /* Darker shade */
              --light-red: #E85A68;         /* Lighter shade */
              --pale-red: #FFF0F1;          /* Very light red */
              --gray-red: #A6363F;          /* Muted red */
              /* Supporting Colors */
              --white: #FFFFFF;
              --light-gray: #F5F5F5;
              --medium-gray: #6C757D;
              --dark-gray: #343A40;
              --shadow-color: rgba(203, 45, 62, 0.1);
          }

          /* Page Background */
          body {
              background: linear-gradient(135deg, var(--pale-red) 0%, var(--light-gray) 100%);
              min-height: 100vh;
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          }

          /* Dashboard Container */
          .container {
              max-width: 1200px;
          }

          /* Main Title */
          h2 {
              color: var(--dark-red);
              font-weight: 700;
              text-align: center;
              margin-bottom: 2rem;
              position: relative;
          }

          h2::after {
              content: '';
              position: absolute;
              bottom: -10px;
              left: 50%;
              transform: translateX(-50%);
              width: 80px;
              height: 3px;
              background: linear-gradient(135deg, var(--primary-red), var(--light-red));
              border-radius: 2px;
          }

          /* Loading and Error Messages */
          .loading-message {
              text-align: center;
              padding: 2rem;
              background: var(--white);
              border-radius: 12px;
              box-shadow: 0 5px 15px var(--shadow-color);
              color: var(--medium-gray);
              font-size: 1.1rem;
          }

          .loading-message::before {
              content: '';
              display: inline-block;
              width: 20px;
              height: 20px;
              border: 2px solid var(--light-gray);
              border-top: 2px solid var(--primary-red);
              border-radius: 50%;
              animation: spin 1s linear infinite;
              margin-right: 10px;
          }

          @keyframes spin {
              to {
                  transform: rotate(360deg);
              }
          }

          .alert-danger {
              background: linear-gradient(135deg, rgba(203, 45, 62, 0.1), rgba(139, 30, 43, 0.05));
              border: 1px solid var(--primary-red);
              color: var(--dark-red);
              border-radius: 12px;
              padding: 1rem 1.5rem;
              font-weight: 500;
          }

          /* Form Controls */
          .form-label {
              color: var(--dark-gray);
              font-weight: 600;
              margin-bottom: 0.75rem;
              font-size: 1.1rem;
          }

          .form-select {
              border: 2px solid #e9ecef;
              border-radius: 10px;
              padding: 12px 16px;
              font-size: 1rem;
              background-color: var(--white);
              transition: all 0.3s ease;
              box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          }

          .form-select:focus {
              border-color: var(--primary-red);
              box-shadow: 0 0 0 0.2rem rgba(203, 45, 62, 0.25);
              outline: none;
          }

          .form-select option {
              padding: 10px;
              background: var(--white);
              color: var(--dark-gray);
          }

          /* Navigation Tabs */
          .nav-tabs {
              border: none;
              margin-bottom: 0;
              background: var(--white);
              border-radius: 12px 12px 0 0;
              padding: 0.5rem 0.5rem 0;
              box-shadow: 0 2px 8px var(--shadow-color);
          }

          .nav-tabs .nav-item {
              margin-bottom: 0;
          }

          .nav-tabs .nav-link {
              border: none;
              color: var(--medium-gray);
              font-weight: 600;
              padding: 12px 24px;
              border-radius: 8px;
              margin-right: 8px;
              transition: all 0.3s ease;
              background: transparent;
              position: relative;
          }

          .nav-tabs .nav-link:hover {
              border: none;
              background: rgba(203, 45, 62, 0.1);
              color: var(--primary-red);
              transform: translateY(-2px);
          }

          .nav-tabs .nav-link.active {
              background: linear-gradient(135deg, var(--primary-red), var(--gray-red));
              color: var(--white);
              border: none;
              transform: translateY(-2px);
              box-shadow: 0 4px 12px rgba(203, 45, 62, 0.3);
          }

          .nav-tabs .nav-link.active::after {
              content: '';
              position: absolute;
              bottom: -1px;
              left: 0;
              right: 0;
              height: 2px;
              background: var(--white);
          }

          /* Card Styling */
          .card {
              border: none;
              border-radius: 0 12px 12px 12px;
              box-shadow: 0 10px 30px var(--shadow-color);
              overflow: hidden;
          }

          .card-body {
              background: var(--white);
              padding: 2.5rem;
              min-height: 300px;
          }

          /* Content Styling */
          .card-body p {
              margin-bottom: 1rem;
              padding: 0.75rem;
              background: var(--pale-red);
              border-left: 4px solid var(--primary-red);
              border-radius: 6px;
              transition: all 0.2s ease;
          }

          .card-body p:hover {
              background: rgba(203, 45, 62, 0.08);
              transform: translateX(5px);
          }

          .card-body strong {
              color: var(--dark-red);
              font-weight: 600;
              display: inline-block;
              min-width: 180px;
          }

          /* Lists */
          .card-body ul {
              background: var(--pale-red);
              padding: 1.5rem;
              border-radius: 8px;
              border-left: 4px solid var(--primary-red);
              margin-top: 1rem;
          }

          .card-body li {
              padding: 0.5rem 0;
              color: var(--dark-gray);
              border-bottom: 1px solid rgba(203, 45, 62, 0.1);
              font-weight: 500;
          }

          .card-body li:last-child {
              border-bottom: none;
          }

          /* No Data Messages */
          .card-body > div:only-child {
              text-align: center;
              padding: 3rem;
              color: var(--medium-gray);
              font-size: 1.1rem;
              border-radius: 8px;
          }

          .card-body > div:only-child::before {
              content: '📋';
              display: block;
              font-size: 3rem;
              margin-bottom: 1rem;
              opacity: 0.5;
          }

          /* Action Button */
          .btn-primary {
              background: linear-gradient(135deg, var(--primary-red), var(--gray-red));
              border: none;
              border-radius: 10px;
              padding: 14px 28px;
              font-weight: 600;
              font-size: 1.1rem;
              transition: all 0.3s ease;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              box-shadow: 0 4px 15px rgba(203, 45, 62, 0.2);
          }

          .btn-primary:hover {
              background: linear-gradient(135deg, var(--dark-red), var(--primary-red));
              transform: translateY(-3px);
              box-shadow: 0 8px 25px rgba(203, 45, 62, 0.3);
          }

          .btn-primary:active {
              transform: translateY(-1px);
              box-shadow: 0 4px 15px rgba(203, 45, 62, 0.4);
          }

          /* Button Container */
          .mt-4 {
              text-align: center;
              padding-top: 2rem;
          }

          /* Domain Selector Section */
          .mb-4 {
              background: var(--white);
              padding: 1.5rem;
              border-radius: 12px;
              box-shadow: 0 5px 15px var(--shadow-color);
              border: 1px solid rgba(203, 45, 62, 0.1);
          }

          /* Responsive Design */
          @media (max-width: 768px) {
              .container {
                  padding: 1rem;
              }
              
              h2 {
                  font-size: 1.75rem;
                  margin-bottom: 1.5rem;
              }
              
              .nav-tabs {
                  flex-direction: column;
                  border-radius: 12px;
              }
              
              .nav-tabs .nav-link {
                  margin-right: 0;
                  margin-bottom: 5px;
                  text-align: center;
              }
              
              .card {
                  border-radius: 12px;
              }
              
              .card-body {
                  padding: 1.5rem;
              }
              
              .card-body strong {
                  min-width: auto;
                  display: block;
                  margin-bottom: 0.25rem;
              }
          }

          @media (max-width: 576px) {
              .card-body p {
                  padding: 0.5rem;
              }
              
              .btn-primary {
                  width: 100%;
                  margin-top: 1rem;
              }
          }

          /* Animation for tab content */
          .card-body > div {
              animation: fadeIn 0.3s ease-in;
          }

          @keyframes fadeIn {
              from {
                  opacity: 0;
                  transform: translateY(10px);
              }
              to {
                  opacity: 1;
                  transform: translateY(0);
              }
          }

          /* Enhanced focus states for accessibility */
          .nav-link:focus,
          .form-select:focus,
          .btn-primary:focus {
              outline: 2px solid var(--primary-red);
              outline-offset: 2px;
          }

          /* Loading state for buttons */
          .btn-primary:disabled {
              background: var(--medium-gray);
              cursor: not-allowed;
              transform: none;
              box-shadow: none;
          }

          /* Hover effects for interactive elements */
          .card:hover {
              transform: translateY(-2px);
              box-shadow: 0 15px 40px var(--shadow-color);
              transition: all 0.3s ease;
          }

          /* Status indicators */
          .status-active {
              color: #28a745;
              font-weight: bold;
          }

          .status-inactive {
              color: var(--primary-red);
              font-weight: bold;
          }

          .status-pending {
              color: #ffc107;
              font-weight: bold;
          }
        `}
      </style>
      <h2 className="mb-4">DNS Dashboard</h2>
      {loading && <div>Loading...</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {/* Domain Selector */}
      <div className="mb-4">
        <label htmlFor="domainSelect" className="form-label">
          Select Domain:
        </label>
        <select
          id="domainSelect"
          className="form-select"
          value={selectedDomain || ""}
          onChange={(e) => setSelectedDomain(e.target.value)}
        >
          {domains.map((domain) => (
            <option key={domain} value={domain}>
              {domain}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            className={`nav-link ${tab === "details" ? "active" : ""}`}
            onClick={() => setTab("details")}
          >
            Details
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${tab === "contacts" ? "active" : ""}`}
            onClick={() => setTab("contacts")}
          >
            Contacts
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${tab === "nameservers" ? "active" : ""}`}
            onClick={() => setTab("nameservers")}
          >
            Name Servers
          </button>
        </li>
      </ul>

      {/* Tab Content */}
      <div className="card">
        <div className="card-body">
          {tab === "details" &&
            (domainDetails ? (
              <div>
                <p>
                  <strong>Domain Name:</strong>{" "}
                  {domainDetails.domainName || selectedDomain}
                </p>
                <p>
                  <strong>Domain Created On:</strong>{" "}
                  {domainDetails.createdOn || "N/A"}
                </p>
                <p>
                  <strong>Domain Status:</strong>{" "}
                  {domainDetails.status || "N/A"}
                </p>
                <p>
                  <strong>Registrar Name:</strong>{" "}
                  {domainDetails.registrarName || "N/A"}
                </p>
                <p>
                  <strong>Name Servers:</strong>{" "}
                  {domainDetails.nameServers &&
                  domainDetails.nameServers.length > 0
                    ? domainDetails.nameServers.join(", ")
                    : "N/A"}
                </p>
              </div>
            ) : (
              <div>No details available.</div>
            ))}
          {tab === "contacts" &&
            (domainDetails && domainDetails.contacts ? (
              <div>
                <p>
                  <strong>First Name:</strong>{" "}
                  {domainDetails.contacts.firstName || "N/A"}
                </p>
                <p>
                  <strong>Last Name:</strong>{" "}
                  {domainDetails.contacts.lastName || "N/A"}
                </p>
                <p>
                  <strong>Organization Name:</strong>{" "}
                  {domainDetails.contacts.organizationName || "N/A"}
                </p>
                <p>
                  <strong>Email:</strong>{" "}
                  {domainDetails.contacts.email || "N/A"}
                </p>
                <p>
                  <strong>Phone Number:</strong>{" "}
                  {domainDetails.contacts.phoneNumber || "N/A"}
                </p>
                <p>
                  <strong>Fax Number:</strong>{" "}
                  {domainDetails.contacts.faxNumber || "N/A"}
                </p>
                <p>
                  <strong>Address 1:</strong>{" "}
                  {domainDetails.contacts.address1 || "N/A"}
                </p>
                <p>
                  <strong>Address 2:</strong>{" "}
                  {domainDetails.contacts.address2 || "N/A"}
                </p>
                <p>
                  <strong>City:</strong> {domainDetails.contacts.city || "N/A"}
                </p>
                <p>
                  <strong>State:</strong>{" "}
                  {domainDetails.contacts.state || "N/A"}
                </p>
                <p>
                  <strong>Zip/Postal Code:</strong>{" "}
                  {domainDetails.contacts.zipCode || "N/A"}
                </p>
                <p>
                  <strong>Country:</strong>{" "}
                  {domainDetails.contacts.country || "N/A"}
                </p>
              </div>
            ) : (
              <div>No contact info available.</div>
            ))}
          {tab === "nameservers" && (
            <div>
              <strong>Name Servers:</strong>
              <ul>
                {domainDetails &&
                domainDetails.nameServers &&
                domainDetails.nameServers.length > 0 ? (
                  domainDetails.nameServers.map((ns) => <li key={ns}>{ns}</li>)
                ) : (
                  <li>No name servers found.</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <button
          className="btn btn-primary"
          onClick={() => onGoToConfig(selectedDomain)}
        >
          Go to DNS Configuration
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
