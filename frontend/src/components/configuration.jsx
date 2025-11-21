import React, { useState, useEffect, useRef } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "./css/configuration.css";

// Helper validators
const isValidIPv4 = (ip) =>
  /^(25[0-5]|2[0-4]\d|1?\d{1,2})(\.(25[0-5]|2[0-4]\d|1?\d{1,2})){3}$/.test(
    String(ip)
  );
// NOTE: current IPv6 regex requires full 8 groups - works but does not accept compressed notation.
// If you want compressed IPv6 support later, replace with a more complete validator.
const isValidIPv6 = (ip) =>
  /^(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}$/i.test(String(ip));
const isValidFQDN = (d) =>
  typeof d === "string" &&
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.?$/i.test(
    d
  );
const isValidEmail = (e) =>
  typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e));

// Helper to parse value for complex records - prefer explicit fields if present
function parseRecordValue(record) {
  if (!record) return record || {};
  // If backend already supplies SRV fields separately, use them
  if (record.type === "SRV") {
    return {
      ...record,
      priority:
        record.priority ??
        (() => {
          const [p] = (record.value || "").split(" ");
          return p || "";
        })(),
      weight:
        record.weight ??
        (() => {
          const [, w] = (record.value || "").split(" ");
          return w || "";
        })(),
      port:
        record.port ??
        (() => {
          const [, , pr] = (record.value || "").split(" ");
          return pr || "";
        })(),
      target:
        record.target ??
        (() => {
          const parts = (record.value || "").split(" ");
          return parts.slice(3).join(" ") || "";
        })(),
    };
  }
  if (record.type === "SOA") {
    // backend may provide primary/admin/serial/... separately
    if (record.primary && record.admin) return { ...record };
    const parts = (record.value || "").split(" ");
    return {
      ...record,
      primary: record.primary ?? parts[0] ?? "",
      admin: record.admin ?? parts[1] ?? "",
      serial: record.serial ?? parts[2] ?? "",
      refresh: record.refresh ?? parts[3] ?? "",
      retry: record.retry ?? parts[4] ?? "",
      expire: record.expire ?? parts[5] ?? "",
      minimum: record.minimum ?? parts[6] ?? "",
    };
  }
  if (record.type === "CAA") {
    if (record.flags && record.tag) return { ...record };
    const [flags, tag, ...rest] = (record.value || "").split(" ");
    // keep both `value` and `caaValue` to remain compatible with UI & payload builders
    const caaVal = rest.join(" ");
    return {
      ...record,
      flags: flags ?? "",
      tag: tag ?? "",
      value: caaVal,
      caaValue: caaVal,
    };
  }
  // default
  return { ...record };
}

// Build payload for create/update. Use current domain (selectedDomain param) and include fields expected by backend.
function buildPayload(formData, userId, selectedDomain) {
  const base = {
    domain: selectedDomain,
    type: formData.type,
    name: formData.name || "@",
    ttl: Number(formData.ttl) || 3600,
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

const Configuration = ({ selectedDomain, onGoToDashboard, onLogout }) => {
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
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Form data for new/edit record
  const [formData, setFormData] = useState({
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
    id: undefined,
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
  const API_BASE_URL =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
  const getAuthToken = () => localStorage.getItem("authToken");
  const userId = localStorage.getItem("userId");

  // Real API call function
  const apiCall = async (endpoint, options = {}) => {
    try {
      const token = getAuthToken();
      const headers = {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      // default JSON header for body-present requests
      if (options.body && !headers["Content-Type"])
        headers["Content-Type"] = "application/json";

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const contentType = response.headers.get("content-type") || "";
      let data;
      if (contentType.includes("application/json")) {
        data = await response.json().catch(() => ({}));
      } else {
        const text = await response.text();
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { message: text || `HTTP error! status: ${response.status}` };
        }
      }

      if (!response.ok) {
        throw new Error(
          data?.message || `HTTP error! status: ${response.status}`
        );
      }
      return data;
    } catch (error) {
      console.error("API call error:", error);
      setError(error.message);
      throw error;
    }
  };

  // avoid race conditions: track latest fetch id
  const latestFetchId = useRef(0);

  const fetchRecords = async () => {
    if (!domain) return;
    const fetchId = ++latestFetchId.current;
    setLoadingRecords(true);
    setError("");
    try {
      const queryParams = new URLSearchParams({
        page: currentPage,
        limit: 10,
        ...(filters.type && { type: filters.type }),
        ...(filters.name && { name: filters.name }),
        ...(filters.isActive && { isActive: filters.isActive }),
      });

      const response = await apiCall(
        `/domains/${domain}?${queryParams.toString()}`
      );
      // if a newer fetch was started, ignore this response
      if (fetchId !== latestFetchId.current) return;
      if (response.success) {
        setRecords(response.data.records || []);
        setTotalPages(
          response.data.pagination ? response.data.pagination.pages : 1
        );
      } else {
        setRecords([]);
        setTotalPages(1);
      }
    } catch (error) {
      console.error("Error fetching records:", error);
      setRecords([]);
      setTotalPages(1);
    } finally {
      if (fetchId === latestFetchId.current) setLoadingRecords(false);
    }
  };

  // Reset page when domain or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [domain, filters]);

  // Fetch user domains and set default domain
  const fetchUserDomains = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiCall(`/domains/user/${userId}`);
      if (response.success && response.data.domains) {
        setUserDomains(response.data.domains);
        // Use existing domain if present; otherwise set the first returned domain
        if (!domain) {
          setDomain(response.data.domains[0]?.domain || "");
        } else if (!response.data.domains.find((d) => d.domain === domain)) {
          // If current domain is not in returned list, replace with first available domain
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

  const handleAddDomain = async () => {
    if (!newDomain.trim()) {
      setError("Please enter a domain name.");
      return;
    }
    setAddDomainLoading(true);
    setError("");
    // Prefer to actually create domain/zone on backend if API exists
    try {
      // try create domain via API if endpoint exists, fallback to client-only behavior
      try {
        const resp = await apiCall("/domains/create-zone", {
          method: "POST",
          body: JSON.stringify({ domain: newDomain.trim() }),
        });
        if (resp.success) {
          await fetchUserDomains();
          setDomain(newDomain.trim());
        } else {
          // fallback
          setDomain(newDomain.trim());
        }
      } catch {
        // fallback: set domain locally (existing behavior)
        setDomain(newDomain.trim());
      }

      setFormData((prev) => ({
        ...prev,
        domain: newDomain.trim(),
        type: "A",
        name: "",
        value: "",
        ttl: 3600,
        priority: "",
        comment: "",
        id: undefined,
      }));
      setEditingRecord(null);
      setShowAddDomainModal(false);
      setNewDomain("");
      setShowModal(true);
    } finally {
      setAddDomainLoading(false);
    }
  };

  // handleSubmit updated: uses PUT when editing (formData.id)
  const handleSubmit = async () => {
    setError("");
    // name required except SOA can use @ as name - enforce presence for non-SOA
    if (!formData.name && formData.type !== "SOA") {
      setError("Record name is required");
      return;
    }

    // TTL validation
    if (
      !Number.isInteger(Number(formData.ttl)) ||
      Number(formData.ttl) < 60 ||
      Number(formData.ttl) > 86400
    ) {
      setError("TTL must be an integer between 60 and 86400 seconds");
      return;
    }

    // Type-specific validations
    if (formData.type === "SRV") {
      const { priority, weight, port, target } = formData;
      if ([priority, weight, port].some((v) => v === "" || isNaN(Number(v)))) {
        setError("SRV priority/weight/port must be numbers");
        return;
      }
      if (!target || !isValidFQDN(target)) {
        setError("SRV target must be a valid hostname");
        return;
      }
    } else if (formData.type === "SOA") {
      const { primary, admin, serial, refresh, retry, expire, minimum } =
        formData;
      if (
        !primary ||
        !admin ||
        [serial, refresh, retry, expire, minimum].some(
          (v) => v === "" || isNaN(Number(v))
        )
      ) {
        setError(
          "All SOA fields are required and numeric fields must be numbers"
        );
        return;
      }
      if (!isValidFQDN(primary)) {
        setError("SOA primary must be a valid hostname");
        return;
      }
      if (!isValidEmail(admin)) {
        setError("SOA admin must be a valid email");
        return;
      }
    } else if (formData.type === "CAA") {
      const { flags, tag, value } = formData;
      if (flags === "" || tag === "" || value === "") {
        setError("All CAA fields (flags, tag, value) are required");
        return;
      }
      if (isNaN(Number(flags)) || Number(flags) < 0 || Number(flags) > 255) {
        setError("CAA flags must be a number between 0 and 255");
        return;
      }
    } else if (formData.type === "MX") {
      if (!formData.value || !isValidFQDN(formData.value)) {
        setError("MX mail server must be a valid hostname");
        return;
      }
      if (formData.priority === "" || isNaN(Number(formData.priority))) {
        setError("MX priority is required and must be a number");
        return;
      }
    } else if (formData.type === "A") {
      if (!isValidIPv4(formData.value)) {
        setError("A record requires a valid IPv4 address");
        return;
      }
    } else if (formData.type === "AAAA") {
      if (!isValidIPv6(formData.value)) {
        setError("AAAA record requires a valid IPv6 address");
        return;
      }
    } else if (["CNAME", "NS", "PTR"].includes(formData.type)) {
      if (!isValidFQDN(formData.value)) {
        setError(`${formData.type} value must be a valid hostname`);
        return;
      }
    } else {
      if (!formData.value && !["SOA", "SRV", "CAA"].includes(formData.type)) {
        setError("Record value is required");
        return;
      }
    }

    setActionLoading(true);

    // Build payload using current domain state (not selectedDomain prop)
    const payload = buildPayload(formData, userId, domain);

    try {
      let response;
      if (formData.id) {
        // update existing record
        response = await apiCall(`/domains/${formData.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        // create new
        response = await apiCall("/domains/create", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      if (!response.success) {
        setError(response.message || "Failed to save record");
        return;
      }

      setShowModal(false);
      setError("");
      resetForm();
      await fetchRecords();
      await fetchStats();
    } catch (err) {
      setError(err.message || "Failed to save record");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;

    setActionLoading(true);
    setError("");
    try {
      const response = await apiCall(`/domains/${id}`, { method: "DELETE" });
      if (response.success) {
        // simply refetch records & stats
        await fetchRecords();
        await fetchStats();
      }
    } catch (error) {
      console.error("Error deleting record:", error);
    } finally {
      setActionLoading(false);
    }
  };

  // Reset form should clear all fields and editing id
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
      id: undefined,
    });
    setEditingRecord(null);
    setError("");
  };

  const openModal = (record = null) => {
    setError("");
    if (record) {
      const parsed = parseRecordValue(record);
      setFormData({
        domain: parsed.domain || domain,
        type: parsed.type || "A",
        name: parsed.name || "",
        value: parsed.value || "",
        ttl: parsed.ttl || 3600,
        priority: parsed.priority ?? "",
        weight: parsed.weight ?? "",
        port: parsed.port ?? "",
        target: parsed.target ?? "",
        primary: parsed.primary ?? "",
        admin: parsed.admin ?? "",
        serial: parsed.serial ?? "",
        refresh: parsed.refresh ?? "",
        retry: parsed.retry ?? "",
        expire: parsed.expire ?? "",
        minimum: parsed.minimum ?? "",
        flags: parsed.flags ?? "",
        tag: parsed.tag ?? "",
        comment: parsed.comment ?? "",
        id: parsed.id, // important: preserve id to trigger update
      });
      setEditingRecord(parsed);
    } else {
      resetForm();
    }
    setShowModal(true);
  };

  // Close modal by clicking backdrop or cancel - clear errors
  const closeModal = () => {
    setShowModal(false);
    setError("");
    // reset form to be safe
    resetForm();
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
      // prefer to set selectedDomain first so fetchUserDomains does not overwrite it accidentally
      if (selectedDomain) setDomain(selectedDomain);
      fetchUserDomains();
    }
    // eslint-disable-next-line
  }, [selectedDomain]);

  // When domain, page, or filters change, fetch records and stats
  useEffect(() => {
    if (checkAuth() && domain) {
      fetchRecords();
      fetchStats();
    }
    // eslint-disable-next-line
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
      {(loadingRecords || actionLoading) && (
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
                      {dom.owner?.merchant_name
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
            onClick={(e) => {
              // Clicking on backdrop should close the Add Domain modal (not the record modal)
              if (e.target === e.currentTarget) {
                setShowAddDomainModal(false);
                setNewDomain("");
              }
            }}
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

                  // build a short single-line display and a multi-line tooltip string
                  const buildTooltipAndDisplay = () => {
                    // tooltip lines collected here
                    const lines = [];

                    switch (record.type) {
                      case "SRV":
                        // compact display: target:port (no priority shown here because you have a separate column)
                        lines.push(`Target: ${record.target ?? "-"}`);
                        lines.push(`Port: ${record.port ?? "-"}`);
                        lines.push(`Weight: ${record.weight ?? "-"}`);
                        lines.push(`Priority: ${record.priority ?? "-"}`); // tooltip includes priority
                        if (record.comment)
                          lines.push(`Comment: ${record.comment}`);
                        // display (short)
                        return {
                          display: `${record.target ?? "-"}:${
                            record.port ?? "-"
                          }`,
                          tooltip: lines.join("\n"),
                        };

                      case "SOA":
                        lines.push(`Primary: ${record.primary ?? "-"}`);
                        lines.push(`Admin: ${record.admin ?? "-"}`);
                        lines.push(`Serial: ${record.serial ?? "-"}`);
                        lines.push(`Refresh: ${record.refresh ?? "-"}`);
                        lines.push(`Retry: ${record.retry ?? "-"}`);
                        lines.push(`Expire: ${record.expire ?? "-"}`);
                        lines.push(`Minimum: ${record.minimum ?? "-"}`);
                        if (record.comment)
                          lines.push(`Comment: ${record.comment}`);
                        return {
                          display: `${record.primary ?? "-"} (${
                            record.admin ?? "-"
                          })`,
                          tooltip: lines.join("\n"),
                        };

                      case "CAA": {
                        const caaVal = record.caaValue ?? record.value ?? "";
                        lines.push(`Flags: ${record.flags ?? "-"}`);
                        lines.push(`Tag: ${record.tag ?? "-"}`);
                        lines.push(`Value: ${caaVal || "-"}`);
                        if (record.comment)
                          lines.push(`Comment: ${record.comment}`);
                        return {
                          display: `${record.flags ?? "-"} ${
                            record.tag ?? "-"
                          } "${caaVal}"`,
                          tooltip: lines.join("\n"),
                        };
                      }

                      case "MX":
                        lines.push(`Mail Server: ${record.value ?? "-"}`);
                        lines.push(`Priority: ${record.priority ?? "-"}`); // priority included in tooltip
                        if (record.comment)
                          lines.push(`Comment: ${record.comment}`);
                        return {
                          display: `${record.value ?? "-"}`, // no priority here (priority column exists)
                          tooltip: lines.join("\n"),
                        };

                      case "TXT": {
                        const txt = record.value ?? "";
                        lines.push(txt || "-");
                        if (record.comment)
                          lines.push(`Comment: ${record.comment}`);
                        const short =
                          txt.length > 40 ? txt.slice(0, 40) + "..." : txt;
                        return {
                          display: short || "-",
                          tooltip: lines.join("\n"),
                        };
                      }

                      // simple single-line types
                      case "PTR":
                      case "CNAME":
                      case "NS":
                      case "A":
                      case "AAAA": {
                        lines.push(`${record.value ?? "-"}`);
                        if (record.comment)
                          lines.push(`Comment: ${record.comment}`);
                        return {
                          display: `${record.value ?? "-"}`,
                          tooltip: lines.join("\n"),
                        };
                      }

                      default: {
                        const val = record.value ?? "";
                        lines.push(val || "-");
                        if (record.comment)
                          lines.push(`Comment: ${record.comment}`);
                        const short =
                          val.length > 40 ? val.slice(0, 40) + "..." : val;
                        return {
                          display: short || "-",
                          tooltip: lines.join("\n"),
                        };
                      }
                    }
                  };

                  const { display, tooltip } = buildTooltipAndDisplay();

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

                      {/* Compact single-line value with native tooltip (hover shows full details) */}
                      <td
                        title={tooltip}
                        style={{
                          maxWidth: 320,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {display}
                      </td>

                      {/* TTL */}
                      <td>{record.ttl}s</td>

                      {/* Priority: only show for MX & SRV (keeps it singular) */}
                      <td>
                        {["MX", "SRV"].includes(record.type)
                          ? record.priority ?? "-"
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
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
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
                  onClick={() => closeModal()}
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
                    onClick={() => closeModal()}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary dns-config-btn-primary"
                    onClick={handleSubmit}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
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

export default Configuration;
