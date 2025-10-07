import React, { useEffect, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";

const DEFAULT_NS_COUNT = 3;

const Dashboard = ({ onGoToConfig }) => {
  const [domains, setDomains] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [tab, setTab] = useState("details");
  const [domainDetails, setDomainDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nameServers, setNameServers] = useState([]);
  const [editingNS, setEditingNS] = useState(false);
  const [nsInput, setNsInput] = useState([]);
  const [zoneDetails, setZoneDetails] = useState(null);

  // --- Activity/Audit Log State ---
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const userId = localStorage.getItem("userId");
  const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
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
  }, [selectedDomain]);

  useEffect(() => {
    const fetchZoneDetails = async () => {
      if (!selectedDomain) {
        setZoneDetails(null);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const token = getAuthToken();
        const resp = await fetch(`${API_BASE_URL}/zones/${selectedDomain}`, {
          headers: {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        });
        const data = await resp.json();
        if (data.success) {
          setZoneDetails(data.data);
        } else {
          setZoneDetails(null);
        }
      } catch (e) {
        setZoneDetails(null);
      }
      setLoading(false);
    };
    fetchZoneDetails();
  }, [selectedDomain]);

  useEffect(() => {
    if (zoneDetails && Array.isArray(zoneDetails.nameServers)) {
      setNsInput(zoneDetails.nameServers);
    }
  }, [zoneDetails]);

  // --- Fetch Audit Logs when Activity tab is selected ---
  useEffect(() => {
    if (tab === "activity" && selectedDomain) {
      setAuditLoading(true);
      setError("");
      const fetchAuditLogs = async () => {
        try {
          const token = getAuthToken();
          const resp = await fetch(
            `${API_BASE_URL}/auditlog/${selectedDomain}`,
            {
              headers: {
                "Content-Type": "application/json",
                ...(token && { Authorization: `Bearer ${token}` }),
              },
            }
          );
          const data = await resp.json();
          if (data.success) {
            setAuditLogs(data.data);
          } else {
            setAuditLogs([]);
            setError(data.message || "Failed to fetch audit logs");
          }
        } catch (e) {
          setAuditLogs([]);
          setError("Failed to fetch audit logs");
        }
        setAuditLoading(false);
      };
      fetchAuditLogs();
    }
  }, [tab, selectedDomain]);

  const handleEditNS = () => {
    setEditingNS(true);
  };

  const handleSaveNS = async () => {
    setLoading(true);
    setError("");
    try {
      const token = getAuthToken();
      const resp = await fetch(
        `${API_BASE_URL}/zones/${selectedDomain}/nameservers`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({ nameServers: nsInput }),
        }
      );
      const data = await resp.json();
      if (data.success) {
        setEditingNS(false);
        setZoneDetails((prev) => ({ ...prev, nameServers: nsInput }));
      } else {
        setError(data.message || "Failed to update name servers");
      }
    } catch (e) {
      setError("Failed to update name servers");
    }
    setLoading(false);
  };

  return (
    <div className="container py-5">
      <style>
        {`
          :root {
              /* Professional Red Color Palette */
              --primary-red: #CB2D3E;
              --dark-red: #8B1E2B;
              --light-red: #E85A68;
              --pale-red: #FFF0F1;
              --gray-red: #A6363F;
              /* Supporting Colors */
              --white: #FFFFFF;
              --light-gray: #F5F5F5;
              --medium-gray: #6C757D;
              --dark-gray: #343A40;
              --shadow-color: rgba(203, 45, 62, 0.1);
          }

          body {
              background: linear-gradient(135deg, var(--pale-red) 0%, var(--light-gray) 100%);
              min-height: 100vh;
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          }

          .container {
              max-width: 1200px;
          }

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

          .card {
              border: none;
              border-radius: 0 12px 12px 12px;
              box-shadow: 0 10px 30px var(--shadow-color);
              overflow: hidden;
              transition: all 0.3s ease;
          }

          .card:hover {
              transform: translateY(-2px);
              box-shadow: 0 15px 40px var(--shadow-color);
          }

          .card-body {
              background: var(--white);
              padding: 2.5rem;
              min-height: 300px;
          }

          .card-body p {
              text-align: left;
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

          .card-body ul {
              list-style: none;
              padding: 0;
              margin: 1.5rem 0;
          }

          .card-body li {
              padding: 1rem 1.25rem;
              margin-bottom: 0.5rem;
              background: var(--pale-red);
              border-left: 4px solid var(--primary-red);
              border-radius: 6px;
              color: var(--dark-gray);
              font-weight: 500;
              transition: all 0.2s ease;
          }

          .card-body li:hover {
              background: rgba(203, 45, 62, 0.08);
              transform: translateX(5px);
              border-left-color: var(--dark-red);
          }

          .card-body li:last-child {
              margin-bottom: 0;
          }

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

          /* Form Controls for Name Servers */
          .form-control {
              border: 2px solid #e9ecef;
              border-radius: 10px;
              padding: 12px 16px;
              font-size: 1rem;
              background-color: var(--white);
              transition: all 0.3s ease;
              box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          }

          .form-control:focus {
              border-color: var(--primary-red);
              box-shadow: 0 0 0 0.2rem rgba(203, 45, 62, 0.25);
              outline: none;
          }

          .input-group {
              margin-bottom: 1rem;
          }

          .input-group .form-control {
              border-radius: 10px 0 0 10px;
          }

          /* Button Styles */
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
              color: var(--white);
          }

          .btn-primary:hover {
              background: linear-gradient(135deg, var(--dark-red), var(--primary-red));
              transform: translateY(-3px);
              box-shadow: 0 8px 25px rgba(203, 45, 62, 0.3);
              color: var(--white);
          }

          .btn-primary:active {
              transform: translateY(-1px);
              box-shadow: 0 4px 15px rgba(203, 45, 62, 0.4);
          }

          .btn-primary:disabled {
              background: var(--medium-gray);
              cursor: not-allowed;
              transform: none;
              box-shadow: none;
          }

          .btn-outline-primary {
              border: 2px solid var(--primary-red);
              color: var(--primary-red);
              background: transparent;
              border-radius: 10px;
              padding: 12px 24px;
              font-weight: 600;
              transition: all 0.3s ease;
              text-transform: uppercase;
              letter-spacing: 0.5px;
          }

          .btn-outline-primary:hover {
              background: linear-gradient(135deg, var(--primary-red), var(--gray-red));
              color: var(--white);
              border-color: var(--primary-red);
              transform: translateY(-2px);
              box-shadow: 0 4px 15px rgba(203, 45, 62, 0.3);
          }

          .btn-outline-success {
              border: 2px solid #28a745;
              color: #28a745;
              background: transparent;
              border-radius: 10px;
              padding: 10px 20px;
              font-weight: 600;
              transition: all 0.3s ease;
          }

          .btn-outline-success:hover {
              background: #28a745;
              color: var(--white);
              border-color: #28a745;
              transform: translateY(-2px);
              box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
          }

          .btn-outline-danger {
              border: 2px solid var(--primary-red);
              background: transparent;
              color: var(--primary-red);
              border-radius: 0 10px 10px 0;
              padding: 12px 16px;
              font-weight: 600;
              font-size: 1.2rem;
              transition: all 0.3s ease;
              line-height: 1;
          }

          .btn-outline-danger:hover {
              background: var(--primary-red);
              color: var(--white);
              border-color: var(--primary-red);
              transform: scale(1.05);
          }

          .btn-secondary {
              background: var(--medium-gray);
              border: none;
              border-radius: 10px;
              padding: 12px 24px;
              font-weight: 600;
              color: var(--white);
              transition: all 0.3s ease;
              text-transform: uppercase;
              letter-spacing: 0.5px;
          }

          .btn-secondary:hover {
              background: var(--dark-gray);
              color: var(--white);
              transform: translateY(-2px);
              box-shadow: 0 4px 15px rgba(52, 58, 64, 0.3);
          }

          .btn-sm {
              padding: 10px 20px;
              font-size: 0.95rem;
          }

          .mt-4 {
              text-align: center;
              padding-top: 2rem;
          }

          .mb-4 {
              background: var(--white);
              padding: 1.5rem;
              border-radius: 12px;
              box-shadow: 0 5px 15px var(--shadow-color);
              border: 1px solid rgba(203, 45, 62, 0.1);
          }

          /* Name Server Section Specific */
          .ns-section-title {
              color: var(--dark-red);
              font-weight: 700;
              font-size: 1.3rem;
              margin-bottom: 1.5rem;
              padding-bottom: 0.5rem;
              border-bottom: 2px solid var(--pale-red);
          }

          .ns-edit-form {
              animation: fadeIn 0.3s ease-in;
              padding-top: 1rem;
          }

          .ns-button-group {
              border-top: 1px solid var(--pale-red);
              padding-top: 1.5rem;
              margin-top: 1.5rem;
          }

          /* Activity Tab Styles */
.activity-empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--medium-gray);
  font-size: 1.1rem;
  border-radius: 8px;
  background: var(--pale-red);
  border: 2px dashed rgba(203, 45, 62, 0.2);
  margin-top: 1rem;
}

.activity-empty-state::before {
  content: '📋';
  display: block;
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.activity-table-container {
  overflow-x: auto;
  border-radius: 12px;
  box-shadow: 0 4px 15px var(--shadow-color);
  margin-top: 1.5rem;
  background: var(--white);
}

.activity-table {
  width: 100%;
  background: var(--white);
  border-radius: 8px;
  overflow: hidden;
  border-collapse: separate;
  border-spacing: 0;
}

.activity-table-header {
  background: linear-gradient(135deg, var(--primary-red), var(--gray-red));
  color: var(--white);
}

.activity-table-header th {
  padding: 1rem 1.25rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 0.9rem;
  border: none;
  white-space: nowrap;
  text-align: left;
}

.activity-table-body {
  background: var(--white);
}

.activity-table-row {
  transition: all 0.2s ease;
  border-bottom: 1px solid rgba(203, 45, 62, 0.1);
}

.activity-table-row:hover {
  background: var(--pale-red);
  transform: scale(1.01);
  box-shadow: 0 2px 8px var(--shadow-color);
}

.activity-table-row:last-child {
  border-bottom: none;
}

.activity-table-cell {
  padding: 1rem 1.25rem;
  color: var(--dark-gray);
  font-weight: 500;
  vertical-align: middle;
  border: none;
  border-left: 2px solid transparent;
  transition: all 0.2s ease;
}

.activity-table-row:hover .activity-table-cell:first-child {
  border-left: 4px solid var(--primary-red);
}

.activity-time {
  color: var(--dark-red);
  font-weight: 600;
  white-space: nowrap;
}

.activity-user {
  font-size: 0.9rem;
}

.activity-action {
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.85rem;
  letter-spacing: 0.3px;
  position: relative;
}

.activity-action::before {
  content: '•';
  margin-right: 0.5rem;
  font-size: 1.2rem;
  color: var(--primary-red);
}

/* Color coding for different actions */
.activity-table-row[data-action="CREATE"] .activity-action::before {
  color: #28a745;
}

.activity-table-row[data-action="UPDATE"] .activity-action::before {
  color: #ffc107;
}

.activity-table-row[data-action="DELETE"] .activity-action::before {
  color: var(--primary-red);
}

.activity-entity {
  font-style: italic;
  color: var(--gray-red);
}

.activity-details {
  max-width: 400px;
}

/* Details Pre Code Block */
.activity-details-code {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%) !important;
  border: 1px solid rgba(203, 45, 62, 0.15) !important;
  border-left: 3px solid var(--primary-red) !important;
  border-radius: 8px !important;
  padding: 0.75rem !important;
  font-size: 0.85rem !important;
  font-family: 'Courier New', monospace !important;
  color: var(--dark-gray) !important;
  max-width: 100% !important;
  max-height: 150px !important;
  overflow: auto !important;
  margin: 0 !important;
  line-height: 1.5 !important;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.1) !important;
  white-space: pre-wrap;
  word-break: break-word;
}

.activity-details-code::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.activity-details-code::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.activity-details-code::-webkit-scrollbar-thumb {
  background: var(--primary-red);
  border-radius: 3px;
}

.activity-details-code::-webkit-scrollbar-thumb:hover {
  background: var(--dark-red);
}

/* Striped rows alternative styling */
.activity-table-row:nth-of-type(odd) {
  background-color: rgba(203, 45, 62, 0.02);
}

.activity-table-row:nth-of-type(odd):hover {
  background: var(--pale-red);
}

/* Mobile Responsiveness for Activity Table */
@media (max-width: 992px) {
  .activity-table {
    font-size: 0.9rem;
  }
  
  .activity-table-header th,
  .activity-table-cell {
    padding: 0.75rem;
  }
  
  .activity-details-code {
    max-width: 250px !important;
    font-size: 0.75rem !important;
  }
}

@media (max-width: 768px) {
  .activity-table-container {
    -webkit-overflow-scrolling: touch;
  }
  
  .activity-table-header th {
    font-size: 0.8rem;
    padding: 0.5rem;
  }
  
  .activity-table-cell {
    padding: 0.5rem;
    font-size: 0.85rem;
  }
  
  .activity-details-code {
    max-width: 200px !important;
    max-height: 100px !important;
    font-size: 0.7rem !important;
  }
}

@media (max-width: 576px) {
  /* Stack table for very small screens */
  .activity-table-header {
    display: none;
  }
  
  .activity-table,
  .activity-table-body,
  .activity-table-row,
  .activity-table-cell {
    display: block;
    width: 100%;
  }
  
  .activity-table-row {
    margin-bottom: 1.5rem;
    border: 2px solid var(--pale-red);
    border-radius: 12px;
    padding: 1rem;
    box-shadow: 0 2px 8px var(--shadow-color);
  }
  
  .activity-table-row:hover {
    transform: none;
  }
  
  .activity-table-cell {
    text-align: left;
    padding: 0.75rem 0;
    border: none !important;
    position: relative;
    padding-left: 45%;
    min-height: 40px;
  }
  
  .activity-table-cell::before {
    content: attr(data-label);
    position: absolute;
    left: 0;
    width: 40%;
    padding-right: 10px;
    font-weight: 700;
    color: var(--dark-red);
    text-transform: uppercase;
    font-size: 0.75rem;
  }
  
  .activity-table-cell:first-child {
    border-top: none;
    padding-top: 0;
    border-bottom: 1px solid var(--pale-red);
    padding-bottom: 1rem;
    margin-bottom: 0.5rem;
  }
  
  .activity-table-cell:last-child {
    padding-bottom: 0;
  }
  
  .activity-details {
    max-width: 100%;
  }
  
  .activity-details-code {
    max-width: 100% !important;
    margin-top: 0.5rem;
    padding-left: 0 !important;
  }
  
  .activity-action::before {
    display: none;
  }
}



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

              .btn-primary,
              .btn-outline-primary,
              .btn-secondary {
                  width: 100%;
                  margin-bottom: 0.5rem;
              }

              .btn-primary.me-2,
              .btn-secondary.me-2 {
                  margin-right: 0 !important;
              }

              .input-group {
                  flex-direction: column;
              }

              .input-group .form-control {
                  border-radius: 10px;
                  margin-bottom: 0.5rem;
              }

              .btn-outline-danger {
                  border-radius: 10px;
                  width: 100%;
              }
          }

          @media (max-width: 576px) {
              .card-body p {
                  padding: 0.5rem;
              }
          }

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

          .nav-link:focus,
          .form-select:focus,
          .form-control:focus,
          .btn-primary:focus,
          .btn-outline-primary:focus,
          .btn-outline-success:focus,
          .btn-outline-danger:focus,
          .btn-secondary:focus {
              outline: 2px solid var(--primary-red);
              outline-offset: 2px;
          }

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

      {loading && <div className="loading-message">Loading...</div>}
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
        <li className="nav-item">
          <button
            className={`nav-link ${tab === "activity" ? "active" : ""}`}
            onClick={() => setTab("activity")}
          >
            Activity
          </button>
        </li>
      </ul>

      {/* Tab Content */}
      <div className="card">
        <div className="card-body">
          {tab === "details" &&
            (zoneDetails ? (
              <div>
                <p>
                  <strong>Domain Name:</strong> {zoneDetails.domain}
                </p>
                <p>
                  <strong>Domain Created On:</strong>{" "}
                  {zoneDetails.createdAt
                    ? new Date(zoneDetails.createdAt).toLocaleString()
                    : "N/A"}
                </p>
                <p>
                  <strong>Domain Status:</strong> {zoneDetails.status}
                </p>
                <p>
                  <strong>Registrar Name:</strong> {zoneDetails.registrarName}
                </p>
                <p>
                  <strong>Name Servers:</strong>{" "}
                  {zoneDetails.nameServers
                    ? zoneDetails.nameServers.join(", ")
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
              <div className="ns-section-title">Name Servers</div>
              {!editingNS ? (
                <>
                  <ul>
                    {zoneDetails &&
                    zoneDetails.nameServers &&
                    zoneDetails.nameServers.length > 0 ? (
                      zoneDetails.nameServers.map((ns, idx) => (
                        <li key={idx}>
                          {ns}
                          {idx >= DEFAULT_NS_COUNT && (
                            <span className="text-muted ms-2">(Custom)</span>
                          )}
                        </li>
                      ))
                    ) : (
                      <li
                        style={{
                          borderLeft: "4px solid var(--medium-gray)",
                          background: "var(--light-gray)",
                          color: "var(--medium-gray)",
                          fontStyle: "italic",
                        }}
                      >
                        No name servers found.
                      </li>
                    )}
                  </ul>
                  <button
                    className="btn btn-outline-primary btn-sm"
                    onClick={handleEditNS}
                  >
                    Edit Name Servers
                  </button>
                </>
              ) : (
                <form
                  className="ns-edit-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveNS();
                  }}
                >
                  {/* Show default name servers as read-only */}
                  {nsInput.slice(0, DEFAULT_NS_COUNT).map((ns, idx) => (
                    <div className="input-group" key={idx}>
                      <input
                        className="form-control"
                        value={ns}
                        readOnly
                        disabled
                        style={{ background: "#f5f5f5", color: "#888" }}
                      />
                      <span
                        className="input-group-text bg-light text-muted"
                        style={{ borderLeft: "none" }}
                      >
                        Default
                      </span>
                    </div>
                  ))}
                  {/* Editable custom name servers */}
                  {nsInput.slice(DEFAULT_NS_COUNT).map((ns, idx) => (
                    <div className="input-group" key={DEFAULT_NS_COUNT + idx}>
                      <input
                        className="form-control"
                        value={ns}
                        onChange={(e) => {
                          const arr = [...nsInput];
                          arr[DEFAULT_NS_COUNT + idx] = e.target.value;
                          setNsInput(arr);
                        }}
                        placeholder={`Custom Name Server ${idx + 1}`}
                      />
                      <button
                        type="button"
                        className="btn btn-outline-danger"
                        onClick={() => {
                          const arr = nsInput.filter(
                            (_, i) => i !== DEFAULT_NS_COUNT + idx
                          );
                          setNsInput(arr);
                        }}
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <div className="mb-3">
                    <button
                      type="button"
                      className="btn btn-outline-success btn-sm"
                      onClick={() => setNsInput([...nsInput, ""])}
                    >
                      + Add Name Server
                    </button>
                  </div>
                  <div className="ns-button-group">
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm me-2"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setEditingNS(false);
                        setNsInput(zoneDetails.nameServers || []);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* --- Activity Tab --- */}
          {tab === "activity" && (
            <div>
              <h5 className="ns-section-title">Activity History</h5>
              {auditLoading ? (
                <div className="loading-message">Loading activity...</div>
              ) : error ? (
                <div className="alert alert-danger">{error}</div>
              ) : auditLogs.length === 0 ? (
                <div className="activity-empty-state">
                  No activity found for this domain.
                </div>
              ) : (
                <div className="activity-table-container">
                  <table className="activity-table">
                    <thead className="activity-table-header">
                      <tr>
                        <th>When</th>
                        <th>User ID</th>
                        <th>Action</th>
                        <th>Entity</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody className="activity-table-body">
                      {auditLogs.map((log) => (
                        <tr
                          key={log.id}
                          className="activity-table-row"
                          data-action={log.action}
                        >
                          <td
                            className="activity-table-cell activity-time"
                            data-label="When"
                          >
                            {log.timestamp
                              ? new Date(log.timestamp).toLocaleString()
                              : ""}
                          </td>
                          <td
                            className="activity-table-cell activity-user"
                            data-label="User ID"
                          >
                            {log.userId}
                          </td>
                          <td
                            className="activity-table-cell activity-action"
                            data-label="Action"
                          >
                            {log.action}
                          </td>
                          <td
                            className="activity-table-cell activity-entity"
                            data-label="Entity"
                          >
                            {log.entityType}
                          </td>
                          <td
                            className="activity-table-cell activity-details"
                            data-label="Details"
                          >
                            <pre className="activity-details-code">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
