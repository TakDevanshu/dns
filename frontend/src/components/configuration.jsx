import React, { useState, useEffect } from "react";
import "bootstrap/dist/css/bootstrap.min.css";

const DNSManagement = ({ selectedDomain, onGoToDashboard, onLogout }) => {
  const [domain, setDomain] = useState(selectedDomain || "");
  const [userDomains, setUserDomains] = useState([]);
  const [showAddDomainModal, setShowAddDomainModal] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [addDomainLoading, setAddDomainLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    type: "",
    name: "",
    isActive: "",
  });

  // Form data for new/edit record
  const [formData, setFormData] = useState({
    domain: "",
    type: "A",
    name: "",
    value: "",
    ttl: 3600,
    priority: "",
    comment: "",
  });

  const recordTypes = [
    "A",
    "AAAA",
    "CNAME",
    "MX",
    "TXT",
    "NS",
    "SOA",
    "SRV",
    "PTR",
    "CAA",
  ];

  // API configuration
  const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
  const getAuthToken = () => localStorage.getItem("authToken");
  const userId = localStorage.getItem("userId");

  // Real API call function
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
      console.error("API call error:", error);
      setError(error.message);
      throw error;
    }
  };

  const fetchRecords = async () => {
    setLoading(true);
    setError("");
    try {
      const queryParams = new URLSearchParams({
        page: currentPage,
        limit: 10,
        ...(filters.type && { type: filters.type }),
        ...(filters.name && { name: filters.name }),
        ...(filters.isActive && { isActive: filters.isActive }),
      });

      const response = await apiCall(`/domains/${domain}?${queryParams}`);
      console.log(response, "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
      if (response.success) {
        setRecords(response.data.records);
        setTotalPages(response.data.pagination.pages);
      }
    } catch (error) {
      console.error("Error fetching records:", error);
      // Set empty records if error occurs
      setRecords([]);
      setTotalPages(1);
    }
    setLoading(false);
  };

  const handleAddDomain = async () => {
    if (!newDomain.trim()) {
      setError("Please enter a domain name.");
      return;
    }
    setAddDomainLoading(true);
    setError("");
    setDomain(newDomain.trim());
    setFormData({
      domain: newDomain.trim(),
      type: "A",
      name: "",
      value: "",
      ttl: 3600,
      priority: "",
      comment: "",
    });
    setEditingRecord(null);
    setShowAddDomainModal(false);
    setNewDomain("");
    setShowModal(true);
    setAddDomainLoading(false);
  };

  // Fetch user domains and set default domain
  const fetchUserDomains = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiCall(`/domains/user/${userId}`);
      if (response.success && response.data.domains) {
        setUserDomains(response.data.domains);
        // If current domain is missing, select first available or clear
        if (!response.data.domains.includes(domain)) {
          setDomain(response.data.domains[0] || "");
        }
      } else {
        setUserDomains([]);
        setDomain("");
      }
    } catch (error) {
      setUserDomains([]);
      setDomain("");
    }
    setLoading(false);
  };

  const fetchStats = async () => {
    setError("");
    try {
      const response = await apiCall(`/domains/${domain}/stats`);
      if (response.success) {
        setStats(response.data);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
      setStats({
        totalRecords: 0,
        activeRecords: 0,
        inactiveRecords: 0,
        recordsByType: {},
      });
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.value) {
      setError("Please fill in all required fields");
      return;
    }

    // Validate priority for MX and SRV records
    if (
      ["MX", "SRV"].includes(formData.type) &&
      (!formData.priority || formData.priority < 0 || formData.priority > 65535)
    ) {
      setError("Valid priority (0-65535) required for MX/SRV records");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload = {
        ...formData,
        domain,
        userId,
        ...(formData.priority && { priority: parseInt(formData.priority) }),
        ttl: parseInt(formData.ttl),
      };

      let response;

      if (editingRecord) {
        // Update existing record
        response = await apiCall(`/domains/${editingRecord.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        // Create new record
        response = await apiCall("/domains/create", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      if (response.success) {
        setShowModal(false);
        resetForm();
        await fetchRecords();
        await fetchStats();
      }
    } catch (error) {
      console.error("Error saving record:", error);
    }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;

    setLoading(true);
    setError("");
    try {
      const response = await apiCall(`/domains/${id}`, { method: "DELETE" });
      if (response.success) {
        await fetchRecords();
        await fetchStats();
        const recordsResp = await apiCall(`/domains/${domain}?limit=1`);
        if (recordsResp.success && recordsResp.data.records.length === 0) {
          await fetchUserDomains();
        }
      }
    } catch (error) {
      console.error("Error deleting record:", error);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormData({
      domain: "",
      type: "A",
      name: "",
      value: "",
      ttl: 3600,
      priority: "",
      comment: "",
    });
    setEditingRecord(null);
  };

  const openModal = (record = null) => {
    setError("");
    if (record) {
      setFormData({
        ...record,
        priority: record.priority || "",
        comment: record.comment || "",
      });
      setEditingRecord(record);
    } else {
      resetForm();
    }
    setShowModal(true);
  };

  // Check if user is authenticated
  const checkAuth = () => {
    const token = getAuthToken();
    if (!token) {
      setError("Please login to access DNS management");
      return false;
    }
    return true;
  };

  // On mount, fetch user domains and set selected domain if provided
  useEffect(() => {
    if (checkAuth()) {
      fetchUserDomains();
      if (selectedDomain) {
        setDomain(selectedDomain);
      }
    }
    // eslint-disable-next-line
  }, [selectedDomain]);

  // When domain, page, or filters change, fetch records and stats
  useEffect(() => {
    if (checkAuth() && domain) {
      fetchRecords();
      fetchStats();
    }
  }, [domain, currentPage, filters]);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return (
    <div className="dns-management">
      <style>
        {`
          :root {
            --primary-red: #CB2D3E;
            --dark-red: #8B1E2B;
            --light-red: #E85A68;
            --pale-red: #FFF0F1;
            --gray-red: #A6363F;
            --white: #FFFFFF;
            --light-gray: #F5F5F5;
            --medium-gray: #6C757D;
            --dark-gray: #343A40;
            --shadow-color: rgba(203, 45, 62, 0.1);
          }

          .dns-management {
            background: var(--light-gray);
            min-height: 100vh;
          }

          .brand-header {
            background: linear-gradient(135deg, var(--primary-red), var(--dark-red));
            color: white;
            padding: 2rem 0;
            margin-bottom: 2rem;
            box-shadow: 0 4px 20px var(--shadow-color);
          }

          .btn-outline-primary.dashboard-btn {
            color: var(--primary-red);
            border-color: var(--primary-red);
            background: rgba(255, 255, 255, 0.9);
            border-radius: 8px;
          }

          .btn-outline-primary.dashboard-btn:hover {
            background: var(--primary-red);
            border-color: var(--primary-red);
            color: white;
          }

          .btn-outline-primary.dashboard-btn:focus {
            box-shadow: 0 0 0 0.2rem rgba(var(--primary-red), 0.25);
          }

          .stats-card {
            background: white;
            border: none;
            border-radius: 12px;
            box-shadow: 0 4px 15px var(--shadow-color);
            transition: transform 0.2s ease;
          }

          .stats-card:hover {
            transform: translateY(-2px);
          }

          .stats-number {
            font-size: 2rem;
            font-weight: bold;
            color: var(--primary-red);
          }

          .btn-primary {
            background: var(--primary-red);
            border-color: var(--primary-red);
            border-radius: 8px;
            padding: 0.5rem 1.5rem;
            font-weight: 500;
          }

          .btn-primary:hover {
            background: var(--dark-red);
            border-color: var(--dark-red);
          }

          .btn-outline-primary {
            color: var(--primary-red);
            border-color: var(--primary-red);
            border-radius: 8px;
          }

          .btn-outline-primary:hover {
            background: var(--primary-red);
            border-color: var(--primary-red);
          }

          .btn-danger {
            background: var(--gray-red);
            border-color: var(--gray-red);
            border-radius: 6px;
          }

          .form-control, .form-select {
            border-radius: 8px;
            border: 2px solid #e9ecef;
            padding: 0.75rem 1rem;
          }

          .form-control:focus, .form-select:focus {
            border-color: var(--primary-red);
            box-shadow: 0 0 0 0.2rem var(--shadow-color);
          }

          .table-container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 15px var(--shadow-color);
            overflow: hidden;
          }

          .table th {
            background: var(--pale-red);
            color: var(--dark-red);
            font-weight: 600;
            border: none;
            padding: 1rem;
          }

          .table td {
            padding: 1rem;
            vertical-align: middle;
          }

          .record-type-badge {
            background: var(--primary-red);
            color: white;
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 600;
          }

          .status-active {
            color: #28a745;
            font-weight: 600;
          }

          .status-inactive {
            color: var(--medium-gray);
          }

          .modal-header {
            background: var(--pale-red);
            border-bottom: 2px solid var(--primary-red);
          }

          .domain-selector {
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 10px var(--shadow-color);
            padding: 1.5rem;
            margin-bottom: 2rem;
          }

          .filter-container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 10px var(--shadow-color);
            padding: 1.5rem;
            margin-bottom: 1rem;
          }

          .pagination .page-link {
            color: var(--primary-red);
            border-color: var(--primary-red);
            border-radius: 6px !important;
            margin: 0 2px;
          }

          .pagination .page-link:hover {
            background-color: var(--pale-red);
            border-color: var(--primary-red);
          }

          .pagination .page-item.active .page-link {
            background-color: var(--primary-red);
            border-color: var(--primary-red);
          }

          .loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255, 255, 255, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
          }

          .spinner-border-custom {
            color: var(--primary-red);
          }

          .error-alert {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            max-width: 400px;
          }
        `}
      </style>

      {loading && (
        <div className="loading-overlay">
          <div className="spinner-border spinner-border-custom" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="error-alert">
          <div
            className="alert alert-danger alert-dismissible fade show"
            role="alert"
          >
            {error}
            <button
              type="button"
              className="btn-close"
              onClick={() => setError("")}
              aria-label="Close"
            ></button>
          </div>
        </div>
      )}

      <div className="brand-header">
        <div className="container">
          <div className="row align-items-center">
            <div className="col">
              <h1 className="mb-0">DNS Management</h1>
              <p className="mb-0 mt-2 opacity-75">
                Professional DNS record management system
              </p>
            </div>
            <div className="col-auto d-flex align-items-center gap-2">
              {onGoToDashboard && (
                <button
                  className="btn btn-outline-primary dashboard-btn me-2 fw-bold px-4 py-2"
                  style={{
                    borderWidth: 2,
                    fontSize: "1rem",
                    letterSpacing: "0.5px",
                  }}
                  onClick={onGoToDashboard}
                >
                  <span style={{ fontSize: "1.2em", marginRight: "0.5em" }}>
                    ←
                  </span>{" "}
                  Back to Dashboard
                </button>
              )}
              {onLogout && (
                <button
                  className="btn btn-outline-primary dashboard-btn me-2 fw-bold px-4 py-2"
                  onClick={onLogout}
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        {/* Domain Selector */}
        <div className="domain-selector">
          <div className="row align-items-center">
            <div className="col-md-6">
              <label className="form-label fw-bold">Current Domain</label>
              {userDomains.length > 0 ? (
                <select
                  className="form-select form-select-lg"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                >
                  {userDomains.map((dom) => (
                    <option key={dom} value={dom}>
                      {dom}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="alert alert-info mb-0">
                  No domains found. Please add a domain to begin.
                </div>
              )}
            </div>
            <div className="col-md-6 text-md-end mt-3 mt-md-0">
              <button
                className="btn btn-primary btn-lg me-2"
                onClick={() => setShowAddDomainModal(true)}
              >
                <i className="bi bi-plus-circle me-2"></i>
                Add Domain
              </button>
              <button
                className="btn btn-primary btn-lg"
                onClick={() => openModal()}
                disabled={!domain}
              >
                <i className="bi bi-plus-circle me-2"></i>
                Add DNS Record
              </button>
            </div>
          </div>
        </div>
        {/* Add Domain Modal */}
        {showAddDomainModal && (
          <div
            className="modal show d-block"
            tabIndex="-1"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          >
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Add New Domain</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => {
                      setShowAddDomainModal(false);
                      setNewDomain("");
                    }}
                  ></button>
                </div>
                <div className="modal-body">
                  <label className="form-label">Domain Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. mydomain.com"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    disabled={addDomainLoading}
                  />
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowAddDomainModal(false);
                      setNewDomain("");
                    }}
                    disabled={addDomainLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleAddDomain}
                    disabled={addDomainLoading}
                  >
                    {addDomainLoading ? (
                      <span
                        className="spinner-border spinner-border-sm me-2"
                        role="status"
                      ></span>
                    ) : null}
                    Add Domain
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Statistics Cards */}
        <div className="row mb-4">
          <div className="col-md-3 mb-3">
            <div className="card stats-card">
              <div className="card-body text-center">
                <div className="stats-number">{stats.totalRecords || 0}</div>
                <div className="text-muted">Total Records</div>
              </div>
            </div>
          </div>
          <div className="col-md-3 mb-3">
            <div className="card stats-card">
              <div className="card-body text-center">
                <div className="stats-number text-success">
                  {stats.activeRecords || 0}
                </div>
                <div className="text-muted">Active Records</div>
              </div>
            </div>
          </div>
          <div className="col-md-3 mb-3">
            <div className="card stats-card">
              <div className="card-body text-center">
                <div className="stats-number text-warning">
                  {stats.inactiveRecords || 0}
                </div>
                <div className="text-muted">Inactive Records</div>
              </div>
            </div>
          </div>
          <div className="col-md-3 mb-3">
            <div className="card stats-card">
              <div className="card-body text-center">
                <div className="stats-number">
                  {Object.keys(stats.recordsByType || {}).length}
                </div>
                <div className="text-muted">Record Types</div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="filter-container">
          <div className="row">
            <div className="col-md-4 mb-3">
              <label className="form-label">Filter by Type</label>
              <select
                className="form-select"
                value={filters.type}
                onChange={(e) =>
                  setFilters({ ...filters, type: e.target.value })
                }
              >
                <option value="">All Types</option>
                {recordTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-4 mb-3">
              <label className="form-label">Filter by Name</label>
              <input
                type="text"
                className="form-control"
                placeholder="Enter record name..."
                value={filters.name}
                onChange={(e) =>
                  setFilters({ ...filters, name: e.target.value })
                }
              />
            </div>
            <div className="col-md-4 mb-3">
              <label className="form-label">Filter by Status</label>
              <select
                className="form-select"
                value={filters.isActive}
                onChange={(e) =>
                  setFilters({ ...filters, isActive: e.target.value })
                }
              >
                <option value="">All Status</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Records Table */}
        <div className="table-container">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Value</th>
                <th>TTL</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length > 0 ? (
                records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <span className="record-type-badge">{record.type}</span>
                    </td>
                    <td>
                      <strong>{record.name || "@"}</strong>
                    </td>
                    <td>
                      <code className="text-break">{record.value}</code>
                    </td>
                    <td>{record.ttl}s</td>
                    <td>{record.priority || "-"}</td>
                    <td>
                      <span
                        className={
                          record.isActive ? "status-active" : "status-inactive"
                        }
                      >
                        {record.isActive ? "● Active" : "○ Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="btn-group">
                        <button
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => openModal(record)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(record.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="text-center py-4">
                    <div className="text-muted">
                      <i className="bi bi-inbox display-4 d-block mb-3"></i>
                      No DNS records found for this domain
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <nav className="mt-4">
            <ul className="pagination justify-content-center">
              <li
                className={`page-item ${currentPage === 1 ? "disabled" : ""}`}
              >
                <button
                  className="page-link"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
              </li>
              {[...Array(totalPages)].map((_, i) => (
                <li
                  key={i + 1}
                  className={`page-item ${
                    currentPage === i + 1 ? "active" : ""
                  }`}
                >
                  <button
                    className="page-link"
                    onClick={() => setCurrentPage(i + 1)}
                  >
                    {i + 1}
                  </button>
                </li>
              ))}
              <li
                className={`page-item ${
                  currentPage === totalPages ? "disabled" : ""
                }`}
              >
                <button
                  className="page-link"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </li>
            </ul>
          </nav>
        )}
      </div>

      {/* Add/Edit Record Modal */}
      {showModal && (
        <div
          className="modal show d-block"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {editingRecord ? "Edit DNS Record" : "Add New DNS Record"}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowModal(false)}
                ></button>
              </div>
              <div>
                <div className="modal-body">
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Record Type</label>
                      <select
                        className="form-select"
                        value={formData.type}
                        onChange={(e) =>
                          setFormData({ ...formData, type: e.target.value })
                        }
                      >
                        {recordTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Name *</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="www, @, subdomain..."
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        required
                      />
                      <div className="form-text">Use @ for root domain</div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Value *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder={
                        formData.type === "A"
                          ? "192.168.1.1"
                          : formData.type === "AAAA"
                          ? "2001:db8::1"
                          : formData.type === "CNAME"
                          ? "example.com"
                          : formData.type === "MX"
                          ? "mail.example.com"
                          : "Record value..."
                      }
                      value={formData.value}
                      onChange={(e) =>
                        setFormData({ ...formData, value: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">TTL (seconds)</label>
                      <select
                        className="form-select"
                        value={formData.ttl}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            ttl: parseInt(e.target.value),
                          })
                        }
                      >
                        <option value={300}>5 minutes (300)</option>
                        <option value={1800}>30 minutes (1800)</option>
                        <option value={3600}>1 hour (3600)</option>
                        <option value={14400}>4 hours (14400)</option>
                        <option value={86400}>24 hours (86400)</option>
                      </select>
                    </div>
                    {["MX", "SRV"].includes(formData.type) && (
                      <div className="col-md-6 mb-3">
                        <label className="form-label">Priority *</label>
                        <input
                          type="number"
                          className="form-control"
                          placeholder="10"
                          min="0"
                          max="65535"
                          value={formData.priority}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              priority: e.target.value,
                            })
                          }
                          required
                        />
                      </div>
                    )}
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Comment (Optional)</label>
                    <textarea
                      className="form-control"
                      rows="2"
                      placeholder="Add a note about this record..."
                      value={formData.comment}
                      onChange={(e) =>
                        setFormData({ ...formData, comment: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSubmit}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        ></span>
                        {editingRecord ? "Updating..." : "Creating..."}
                      </>
                    ) : editingRecord ? (
                      "Update Record"
                    ) : (
                      "Create Record"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DNSManagement;
