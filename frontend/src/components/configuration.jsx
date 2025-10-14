import React, { useState, useEffect } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "./css/configuration.css";

// Helper to parse value for complex records
function parseRecordValue(record) {
  if (!record || !record.value) return record;
  if (record.type === "SRV") {
    const [priority, weight, port, ...targetArr] = record.value.split(" ");
    return {
      ...record,
      priority,
      weight,
      port,
      target: targetArr.join(" "),
      displayValue: `${targetArr.join(
        " "
      )}:${port} (prio ${priority}, weight ${weight})`,
    };
  }
  if (record.type === "SOA") {
    const [primary, admin, serial, refresh, retry, expire, minimum] =
      record.value.split(" ");
    return {
      ...record,
      primary,
      admin,
      serial,
      refresh,
      retry,
      expire,
      minimum,
      displayValue: `Primary: ${primary}, Admin: ${admin}, Serial: ${serial}`,
    };
  }
  if (record.type === "CAA") {
    const [flags, tag, ...valueArr] = record.value.split(" ");
    return {
      ...record,
      flags,
      tag,
      caaValue: valueArr.join(" "),
      displayValue: `flags: ${flags}, tag: ${tag}, value: ${valueArr.join(
        " "
      )}`,
    };
  }
  // Default for other types
  return { ...record, displayValue: record.value };
}

// Add this helper function above your component or inside it
function buildPayload(formData, userId, selectedDomain) {
  const base = {
    domain: selectedDomain,
    type: formData.type,
    name: formData.name,
    ttl: Number(formData.ttl),
    userId,
    comment: formData.comment || "",
  };
  switch (formData.type) {
    case "A":
    case "AAAA":
    case "CNAME":
    case "TXT":
    case "NS":
    case "PTR":
      return { ...base, value: formData.value };
    case "MX":
      return {
        ...base,
        value: formData.value,
        priority: Number(formData.priority),
      };
    case "SRV":
      return {
        ...base,
        priority: Number(formData.priority),
        weight: Number(formData.weight),
        port: Number(formData.port),
        target: formData.target,
      };
    case "SOA":
      return {
        ...base,
        primary: formData.primary,
        admin: formData.admin,
        serial: Number(formData.serial),
        refresh: Number(formData.refresh),
        retry: Number(formData.retry),
        expire: Number(formData.expire),
        minimum: Number(formData.minimum),
      };
    case "CAA":
      return {
        ...base,
        flags: Number(formData.flags),
        tag: formData.tag,
        value: formData.value,
      };
    default:
      return base;
  }
}

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
    type: "",
    name: "",
    value: "",
    ttl: "",
    priority: "",
    weight: "",
    port: "",
    target: "",
    primary: "",
    admin: "",
    serial: "",
    refresh: "",
    retry: "",
    expire: "",
    minimum: "",
    flags: "",
    tag: "",
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
        // Fix: Use .domain for default selection
        if (!response.data.domains.find((d) => d.domain === domain)) {
          setDomain(response.data.domains[0]?.domain || "");
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
    setError("");
    // Validation for required fields
    if (!formData.name) {
      setError("Record name is required");
      return;
    }

    if (formData.type === "SRV") {
      const { priority, weight, port, target } = formData;
      if (!priority || !weight || !port || !target) {
        setError(
          "All SRV fields (priority, weight, port, target) are required"
        );
        return;
      }
    } else if (formData.type === "SOA") {
      const { primary, admin, serial, refresh, retry, expire, minimum } =
        formData;
      if (
        !primary ||
        !admin ||
        !serial ||
        !refresh ||
        !retry ||
        !expire ||
        !minimum
      ) {
        setError("All SOA fields are required");
        return;
      }
    } else if (formData.type === "CAA") {
      const { flags, tag, value } = formData;
      if (!flags || !tag || !value) {
        setError("All CAA fields (flags, tag, value) are required");
        return;
      }
    } else if (!formData.value) {
      setError("Record value is required");
      return;
    }

    // Validate priority for MX and SRV records
    if (
      ["MX", "SRV"].includes(formData.type) &&
      (!formData.priority || formData.priority < 0 || formData.priority > 65535)
    ) {
      setError("Valid priority (0–65535) required for MX/SRV records");
      return;
    }

    setLoading(true);
    setError("");

    // Build the payload
    const payload = buildPayload(formData, userId, selectedDomain);

    try {
      const response = await apiCall("/domains/create", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
      if (!response.success) {
        setError(response.message || "Failed to save record");
        return;
      }

      setShowModal(false);
      resetForm();
      await fetchRecords();
      await fetchStats();
    } catch (error) {
      setError(error.message || "Failed to save record");
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

  // Reset form should clear all fields
  const resetForm = () => {
    setFormData({
      domain: "",
      type: "A",
      name: "",
      value: "",
      ttl: 3600,
      priority: "",
      weight: "",
      port: "",
      target: "",
      primary: "",
      admin: "",
      serial: "",
      refresh: "",
      retry: "",
      expire: "",
      minimum: "",
      flags: "",
      tag: "",
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
    <div className="dns-config-management">
      {loading && (
        <div className="dns-config-loading-overlay">
          <div
            className="spinner-border dns-config-spinner-custom"
            role="status"
          >
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="dns-config-error-alert">
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

      <div className="dns-config-brand-header">
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
                  className="btn btn-outline-primary dns-config-dashboard-btn me-2 fw-bold px-4 py-2"
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
                  className="btn btn-outline-primary dns-config-dashboard-btn me-2 fw-bold px-4 py-2"
                  onClick={onLogout}
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container config-container">
        {/* Domain Selector */}
        <div className="dns-config-domain-selector">
          <div className="row align-items-center">
            <div className="col-md-6">
              <label className="form-label fw-bold">Current Domain</label>
              {userDomains.length > 0 ? (
                <select
                  className="form-select form-select-md"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                >
                  {userDomains.map((dom) => (
                    <option key={dom.domain} value={dom.domain}>
                      {dom.domain}
                      {dom.owner && dom.owner.merchant_name
                        ? ` (Owner: ${dom.owner.merchant_name})`
                        : ""}
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
                style={{ width: "auto" }}
              >
                <i className="bi bi-plus-circle me-2"></i>
                Add Domain
              </button>
              <button
                className="btn btn-primary btn-lg"
                onClick={() => openModal()}
                disabled={!domain}
                style={{ width: "auto" }}
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
                <div className="modal-header dns-config-modal-header">
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
                    className="form-control dns-config-form-control"
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
                    className="btn btn-primary dns-config-btn-primary"
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
        <div className="row mb-4 stats">
          <div className="col-md-3 mb-3">
            <div className="card dns-config-stats-card">
              <div className="card-body text-center">
                <div className="dns-config-stats-number">
                  {stats.totalRecords || 0}
                </div>
                <div className="text-muted">Total Records</div>
              </div>
            </div>
          </div>
          <div className="col-md-3 mb-3">
            <div className="card dns-config-stats-card">
              <div className="card-body text-center">
                <div className="dns-config-stats-number text-success">
                  {stats.activeRecords || 0}
                </div>
                <div className="text-muted">Active Records</div>
              </div>
            </div>
          </div>
          <div className="col-md-3 mb-3">
            <div className="card dns-config-stats-card">
              <div className="card-body text-center">
                <div className="dns-config-stats-number text-warning">
                  {stats.inactiveRecords || 0}
                </div>
                <div className="text-muted">Inactive Records</div>
              </div>
            </div>
          </div>
          <div className="col-md-3 mb-3">
            <div className="card dns-config-stats-card">
              <div className="card-body text-center">
                <div className="dns-config-stats-number">
                  {Object.keys(stats.recordsByType || {}).length}
                </div>
                <div className="text-muted">Record Types</div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="dns-config-filter-container">
          <div className="row">
            <div className="col-md-4 mb-3">
              <label className="form-label">Filter by Type</label>
              <select
                className="form-select dns-config-form-select"
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
                className="form-control dns-config-form-control"
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
                className="form-select dns-config-form-select"
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
        <div className="dns-config-table-container">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Value / Details</th>
                <th>TTL</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length > 0 ? (
                records.map((rec) => {
                  const record = parseRecordValue(rec);
                  return (
                    <tr key={record.id}>
                      <td>
                        <span className="dns-config-record-type-badge">
                          {record.type}
                        </span>
                      </td>
                      <td>
                        <strong>{record.name || "@"}</strong>
                      </td>
                      {/* Value column: show parsed fields for complex types */}
                      <td>
                        {record.type === "SRV" ? (
                          <div>
                            <div>
                              <b>Target:</b> {record.target}
                            </div>
                            <div>
                              <b>Port:</b> {record.port}
                            </div>
                            <div>
                              <b>Priority:</b> {record.priority}
                            </div>
                            <div>
                              <b>Weight:</b> {record.weight}
                            </div>
                          </div>
                        ) : record.type === "SOA" ? (
                          <div>
                            <div>
                              <b>Primary:</b> {record.primary}
                            </div>
                            <div>
                              <b>Admin:</b> {record.admin}
                            </div>
                            <div>
                              <b>Serial:</b> {record.serial}
                            </div>
                            <div>
                              <b>Refresh:</b> {record.refresh}
                            </div>
                            <div>
                              <b>Retry:</b> {record.retry}
                            </div>
                            <div>
                              <b>Expire:</b> {record.expire}
                            </div>
                            <div>
                              <b>Minimum:</b> {record.minimum}
                            </div>
                          </div>
                        ) : record.type === "CAA" ? (
                          <div>
                            <div>
                              <b>Flags:</b> {record.flags}
                            </div>
                            <div>
                              <b>Tag:</b> {record.tag}
                            </div>
                            <div>
                              <b>Value:</b> {record.caaValue}
                            </div>
                          </div>
                        ) : record.type === "MX" ? (
                          <div>
                            <div>
                              <b>Mail Server:</b> {record.value}
                            </div>
                            <div>
                              <b>Priority:</b> {record.priority}
                            </div>
                          </div>
                        ) : record.type === "PTR" ? (
                          <div>
                            <div>
                              <b>Pointer:</b> {record.value}
                            </div>
                          </div>
                        ) : record.type === "CNAME" ? (
                          <div>
                            <div>
                              <b>Alias For:</b> {record.value}
                            </div>
                          </div>
                        ) : record.type === "NS" ? (
                          <div>
                            <div>
                              <b>Name Server:</b> {record.value}
                            </div>
                          </div>
                        ) : record.type === "A" ? (
                          <div>
                            <div>
                              <b>IPv4 Address:</b> {record.value}
                            </div>
                          </div>
                        ) : record.type === "AAAA" ? (
                          <div>
                            <div>
                              <b>IPv6 Address:</b> {record.value}
                            </div>
                          </div>
                        ) : record.type === "TXT" ? (
                          <div>
                            <div>
                              <b>Text:</b> {record.value}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div>
                              <b>Value:</b> {record.value}
                            </div>
                          </div>
                        )}
                      </td>
                      {/* TTL */}
                      <td>{record.ttl}s</td>
                      {/* Priority: show for MX and SRV */}
                      <td>
                        {["MX", "SRV"].includes(record.type)
                          ? record.priority
                          : "-"}
                      </td>
                      {/* Status */}
                      <td>
                        <span
                          className={
                            record.isActive
                              ? "dns-config-status-active"
                              : "dns-config-status-inactive"
                          }
                        >
                          {record.isActive ? "● Active" : "○ Inactive"}
                        </span>
                      </td>
                      {/* Actions */}
                      <td>
                        <div className="btn-group">
                          <button
                            className="btn btn-outline-primary dns-config-btn-outline-primary btn-sm"
                            onClick={() => openModal(record)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-danger dns-config-btn-danger btn-sm"
                            onClick={() => handleDelete(record.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
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
            <ul className="pagination justify-content-center dns-config-pagination">
              <li
                className={`page-item ${currentPage === 1 ? "disabled" : ""}`}
              >
                <button
                  className="page-link dns-config-page-link"
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
                    className="page-link dns-config-page-link"
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
                  className="page-link dns-config-page-link"
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
              <div className="modal-header dns-config-modal-header">
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
                  {/* Record type and name */}
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Record Type</label>
                      <select
                        className="form-select dns-config-form-select"
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
                        className="form-control dns-config-form-control"
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

                  {/* ===== MAIN VALUE FIELDS (depends on record type) ===== */}
                  {["A", "AAAA", "CNAME", "TXT", "NS", "PTR"].includes(
                    formData.type
                  ) && (
                    <div className="mb-3">
                      <label className="form-label">
                        {formData.type === "PTR" ? "Pointer *" : "Value *"}
                      </label>
                      <input
                        type="text"
                        className="form-control dns-config-form-control"
                        placeholder={
                          formData.type === "A"
                            ? "192.168.1.1"
                            : formData.type === "AAAA"
                            ? "2001:db8::1"
                            : formData.type === "CNAME"
                            ? "example.com"
                            : formData.type === "NS"
                            ? "ns1.example.com"
                            : formData.type === "PTR"
                            ? "target.domain.com"
                            : "Record value..."
                        }
                        value={formData.value || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, value: e.target.value })
                        }
                        required
                      />
                    </div>
                  )}

                  {/* ===== MX record fields ===== */}
                  {formData.type === "MX" && (
                    <div className="row">
                      <div className="col-md-6 mb-3">
                        <label className="form-label">Mail Server *</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="mail.example.com"
                          value={formData.value || ""}
                          onChange={(e) =>
                            setFormData({ ...formData, value: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="col-md-6 mb-3">
                        <label className="form-label">Priority *</label>
                        <input
                          type="number"
                          className="form-control"
                          placeholder="10"
                          min="0"
                          max="65535"
                          value={formData.priority || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              priority: e.target.value,
                            })
                          }
                          required
                        />
                      </div>
                    </div>
                  )}

                  {/* ===== SRV record fields ===== */}
                  {formData.type === "SRV" && (
                    <>
                      <div className="row">
                        <div className="col-md-3 mb-3">
                          <label className="form-label">Priority *</label>
                          <input
                            type="number"
                            className="form-control dns-config-form-control"
                            placeholder="10"
                            min="0"
                            max="65535"
                            value={formData.priority || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                priority: e.target.value,
                              })
                            }
                            required
                          />
                        </div>
                        <div className="col-md-3 mb-3">
                          <label className="form-label">Weight *</label>
                          <input
                            type="number"
                            className="form-control dns-config-form-control"
                            placeholder="5"
                            value={formData.weight || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                weight: e.target.value,
                              })
                            }
                            required
                          />
                        </div>
                        <div className="col-md-3 mb-3">
                          <label className="form-label">Port *</label>
                          <input
                            type="number"
                            className="form-control dns-config-form-control"
                            placeholder="443"
                            value={formData.port || ""}
                            onChange={(e) =>
                              setFormData({ ...formData, port: e.target.value })
                            }
                            required
                          />
                        </div>
                        <div className="col-md-3 mb-3">
                          <label className="form-label">Target *</label>
                          <input
                            type="text"
                            className="form-control dns-config-form-control"
                            placeholder="example.com"
                            value={formData.target || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                target: e.target.value,
                              })
                            }
                            required
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* ===== SOA record fields ===== */}
                  {formData.type === "SOA" && (
                    <>
                      <div className="row">
                        <div className="col-md-6 mb-3">
                          <label className="form-label">Primary NS *</label>
                          <input
                            type="text"
                            className="form-control"
                            value={formData.primary || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                primary: e.target.value,
                              })
                            }
                            required
                          />
                        </div>
                        <div className="col-md-6 mb-3">
                          <label className="form-label">Admin Email *</label>
                          <input
                            type="text"
                            className="form-control"
                            value={formData.admin || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                admin: e.target.value,
                              })
                            }
                            required
                          />
                        </div>
                      </div>

                      <div className="row">
                        <div className="col-md-4 mb-3">
                          <label className="form-label">Serial *</label>
                          <input
                            type="number"
                            className="form-control"
                            value={formData.serial || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                serial: e.target.value,
                              })
                            }
                            required
                          />
                        </div>
                        <div className="col-md-4 mb-3">
                          <label className="form-label">Refresh *</label>
                          <input
                            type="number"
                            className="form-control"
                            value={formData.refresh || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                refresh: e.target.value,
                              })
                            }
                            required
                          />
                        </div>
                        <div className="col-md-4 mb-3">
                          <label className="form-label">Retry *</label>
                          <input
                            type="number"
                            className="form-control"
                            value={formData.retry || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                retry: e.target.value,
                              })
                            }
                            required
                          />
                        </div>
                        <div className="col-md-4 mb-3">
                          <label className="form-label">Expire *</label>
                          <input
                            type="number"
                            className="form-control"
                            value={formData.expire || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                expire: e.target.value,
                              })
                            }
                            required
                          />
                        </div>
                        <div className="col-md-4 mb-3">
                          <label className="form-label">Minimum *</label>
                          <input
                            type="number"
                            className="form-control"
                            value={formData.minimum || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                minimum: e.target.value,
                              })
                            }
                            required
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* ===== CAA record fields ===== */}
                  {formData.type === "CAA" && (
                    <div className="row">
                      <div className="col-md-4 mb-3">
                        <label className="form-label">Flags *</label>
                        <input
                          type="number"
                          className="form-control"
                          value={formData.flags || ""}
                          onChange={(e) =>
                            setFormData({ ...formData, flags: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="col-md-4 mb-3">
                        <label className="form-label">Tag *</label>
                        <input
                          type="text"
                          className="form-control"
                          value={formData.tag || ""}
                          onChange={(e) =>
                            setFormData({ ...formData, tag: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="col-md-4 mb-3">
                        <label className="form-label">Value *</label>
                        <input
                          type="text"
                          className="form-control"
                          value={formData.value || ""}
                          onChange={(e) =>
                            setFormData({ ...formData, value: e.target.value })
                          }
                          required
                        />
                      </div>
                    </div>
                  )}

                  {/* ===== TTL & Comment ===== */}
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">TTL (seconds)</label>
                      <select
                        className="form-select dns-config-form-select"
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
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Comment (Optional)</label>
                    <textarea
                      className="form-control dns-config-form-control"
                      rows="2"
                      placeholder="Add a note about this record..."
                      value={formData.comment}
                      onChange={(e) =>
                        setFormData({ ...formData, comment: e.target.value })
                      }
                    />
                  </div>
                </div>

                {/* ===== Footer ===== */}
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
                    className="btn btn-primary dns-config-btn-primary"
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
