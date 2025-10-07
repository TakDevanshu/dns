import React, { useEffect, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "./css/dashboard.css";

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
        const resp = await apiCall(`/zones/${selectedDomain}`);
        if (resp.success && resp.data) {
          setZoneDetails(resp.data);
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
      const resp = await apiCall(`/zones/${selectedDomain}/nameservers`, {
        method: "PUT",
        body: JSON.stringify({ nameServers: nsInput }),
      });

      if (resp.success) {
        setEditingNS(false);
        setZoneDetails((prev) => ({ ...prev, nameServers: nsInput }));
      } else {
        setError(resp.message || "Failed to update name servers");
      }
    } catch (e) {
      setError("Failed to update name servers");
    }

    setLoading(false);
  };

  return (
    <div className="container py-5">
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
