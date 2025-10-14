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
  const [zoneDetails, setZoneDetails] = useState(null);

  // --- Activity/Audit Log State ---
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // --- Team/Invitation State ---
  const [team, setTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [teamError, setTeamError] = useState("");
  const [invites, setInvites] = useState([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");

  const userId = localStorage.getItem("userId");
  const API_BASE_URL =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
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
          setSelectedDomain(resp.data.domains[0].domain);
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
    if (!selectedDomain) return;
    const fetchZoneDetails = async () => {
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
    };
    fetchZoneDetails();
  }, [selectedDomain]);

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

  useEffect(() => {
    const fetchTeam = async () => {
      if (tab !== "team" || !selectedDomain) return;

      setTeamLoading(true);
      setTeamError("");

      try {
        const resp = await apiCall(`/team/${selectedDomain}`);
        if (resp.success && resp.data) {
          console.log("Team:", resp.data);
          setTeam(resp.data);
        } else {
          setTeam([]);
        }
      } catch (e) {
        setTeam([]);
        setTeamError("Failed to fetch team data");
      }

      setTeamLoading(false);
    };

    fetchTeam();
  }, [tab, selectedDomain]);

  useEffect(() => {
    const fetchInvites = async () => {
      if (tab !== "invitations") return;

      setInviteLoading(true);
      setInviteError("");

      try {
        const resp = await apiCall(`/team/invites`);
        if (resp.success && resp.data) {
          setInvites(resp.data);
        } else {
          setInvites([]);
        }
      } catch (e) {
        setInvites([]);
        setInviteError("Failed to fetch invitations");
      }

      setInviteLoading(false);
    };

    fetchInvites();
  }, [tab]);

  const handleRemove = async (userId) => {
    if (!window.confirm("Are you sure you want to remove this team member?"))
      return;
    try {
      await apiCall(`/team/${selectedDomain}/${userId}`, { method: "DELETE" });
      setTeam((team) => team.filter((m) => m.User?.id !== userId));
    } catch (err) {
      setTeamError(err.message || "Failed to remove member");
    }
  };

  const handleChangeRole = async (userId, newRole) => {
    try {
      await apiCall(`/team/${selectedDomain}/${userId}`, {
        method: "PUT",
        body: JSON.stringify({ role: newRole }),
        headers: { "Content-Type": "application/json" },
      });
      setTeam((team) =>
        team.map((m) => (m.User?.id === userId ? { ...m, role: newRole } : m))
      );
    } catch (err) {
      setTeamError(err.message || "Failed to change role");
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setTeamError("");
    try {
      await apiCall("/team/invite", {
        method: "POST",
        body: JSON.stringify({
          domain: selectedDomain,
          email: inviteEmail,
          role: inviteRole,
        }),
      });
      setInviteEmail("");
      setInviteRole("viewer");
      setTab("team");
    } catch (err) {
      setTeamError(err.message);
    }
  };

  const acceptInvite = async (domain) => {
    setInviteError("");
    try {
      const resp = await fetch(`${API_BASE_URL}/team/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ domain }),
      });
      const data = await resp.json();
      if (data.success) {
        setInvites((prev) => prev.filter((i) => i.domain !== domain));
      } else {
        setInviteError(data.message || "Failed to accept invitation.");
      }
    } catch (e) {
      setInviteError("Failed to accept invitation.");
    }
  };

  return (
    <div className="dnsdb-wrapper">
      <div className="dnsdb-header">
        <h2 className="dnsdb-title">DNS Dashboard</h2>
      </div>

      {loading && <div className="dnsdb-loading-message">Loading...</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="dnsdb-domain-selector-container">
        <label htmlFor="domainSelect" className="dnsdb-form-label">
          Select Domain:
        </label>
        <select
          id="domainSelect"
          className="dnsdb-form-select"
          value={selectedDomain || ""}
          onChange={(e) => setSelectedDomain(e.target.value)}
        >
          {domains.map((d) => (
            <option key={d.domain} value={d.domain}>
              {d.domain}
              {d.owner && d.owner.merchant_name
                ? ` (Owner: ${d.owner.merchant_name})`
                : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="dnsdb-layout-container">
        {/* Sidebar with tabs */}
        <aside className="dnsdb-sidebar">
          <nav className="dnsdb-nav">
            <button
              className={`dnsdb-nav-link ${
                tab === "details" ? "dnsdb-nav-link--active" : ""
              }`}
              onClick={() => setTab("details")}
            >
              Details
            </button>
            <button
              className={`dnsdb-nav-link ${
                tab === "contacts" ? "dnsdb-nav-link--active" : ""
              }`}
              onClick={() => setTab("contacts")}
            >
              Contacts
            </button>
            <button
              className={`dnsdb-nav-link ${
                tab === "nameservers" ? "dnsdb-nav-link--active" : ""
              }`}
              onClick={() => setTab("nameservers")}
            >
              Name Servers
            </button>
            <button
              className={`dnsdb-nav-link ${
                tab === "activity" ? "dnsdb-nav-link--active" : ""
              }`}
              onClick={() => setTab("activity")}
            >
              Activity
            </button>
            <button
              className={`dnsdb-nav-link ${
                tab === "team" ? "dnsdb-nav-link--active" : ""
              }`}
              onClick={() => setTab("team")}
            >
              Team
            </button>
            <button
              className={`dnsdb-nav-link ${
                tab === "invitations" ? "dnsdb-nav-link--active" : ""
              }`}
              onClick={() => setTab("invitations")}
            >
              Invitations
            </button>
          </nav>
        </aside>

        {/* Main content area */}
        <main className="dnsdb-content">
          <div className="dnsdb-card">
            <div className="dnsdb-card-body">
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
                      <strong>Registrar Name:</strong>{" "}
                      {zoneDetails.registrarName}
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
                      <strong>City:</strong>{" "}
                      {domainDetails.contacts.city || "N/A"}
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
                  <div className="dnsdb-section-title">Name Servers</div>
                  <ul>
                    {zoneDetails &&
                    zoneDetails.nameServers &&
                    zoneDetails.nameServers.length > 0 ? (
                      zoneDetails.nameServers.slice(0, DEFAULT_NS_COUNT).map((ns, idx) => (
                        <li key={idx}>
                          {ns}
                        </li>
                      ))
                    ) : (
                      <li
                        style={{
                          borderLeft: "4px solid var(--dnsdb-medium-gray)",
                          background: "var(--dnsdb-light-gray)",
                          color: "var(--dnsdb-medium-gray)",
                          fontStyle: "italic",
                        }}
                      >
                        No name servers found.
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {tab === "activity" && (
                <div>
                  <h5 className="dnsdb-section-title">Activity History</h5>
                  {auditLoading ? (
                    <div className="dnsdb-loading-message">
                      Loading activity...
                    </div>
                  ) : error ? (
                    <div className="alert alert-danger">{error}</div>
                  ) : auditLogs.length === 0 ? (
                    <div className="dnsdb-empty-state">
                      No activity found for this domain.
                    </div>
                  ) : (
                    <div className="dnsdb-activity-table-container">
                      <table className="dnsdb-activity-table">
                        <thead className="dnsdb-activity-table-header">
                          <tr>
                            <th>When</th>
                            <th>User ID</th>
                            <th>Action</th>
                            <th>Entity</th>
                            <th>Details</th>
                          </tr>
                        </thead>
                        <tbody className="dnsdb-activity-table-body">
                          {auditLogs.map((log) => (
                            <tr
                              key={log.id}
                              className="dnsdb-activity-table-row"
                              data-action={log.action}
                            >
                              <td
                                className="dnsdb-activity-table-cell dnsdb-activity-time"
                                data-label="When"
                              >
                                {log.timestamp
                                  ? new Date(log.timestamp).toLocaleString()
                                  : ""}
                              </td>
                              <td
                                className="dnsdb-activity-table-cell dnsdb-activity-user"
                                data-label="User ID"
                              >
                                {log.userId}
                              </td>
                              <td
                                className="dnsdb-activity-table-cell dnsdb-activity-action"
                                data-label="Action"
                              >
                                {log.action}
                              </td>
                              <td
                                className="dnsdb-activity-table-cell dnsdb-activity-entity"
                                data-label="Entity"
                              >
                                {log.entityType}
                              </td>
                              <td
                                className="dnsdb-activity-table-cell dnsdb-activity-details"
                                data-label="Details"
                              >
                                <pre className="dnsdb-activity-details-code">
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

              {tab === "team" && (
                <div>
                  <h5>Team Members</h5>
                  {teamLoading ? (
                    <div>Loading...</div>
                  ) : (
                    <>
                      <table className="table team-table">
                        <thead>
                          <tr>
                            <th>Email</th>
                            <th>Name</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {team.map((member) => (
                            <tr key={member.id}>
                              <td>{member.User?.email}</td>
                              <td>{member.User?.merchant_name}</td>
                              <td>
                                {member.isOwner ? (
                                  <span className="badge bg-primary">
                                    Owner
                                  </span>
                                ) : (
                                  <select
                                    value={member.role}
                                    onChange={(e) =>
                                      handleChangeRole(
                                        member.User.id,
                                        e.target.value
                                      )
                                    }
                                    className="form-select form-select-sm"
                                    style={{
                                      width: 110,
                                      display: "inline-block",
                                    }}
                                  >
                                    <option value="viewer">Viewer</option>
                                    <option value="editor">Editor</option>
                                    <option value="admin">Admin</option>
                                  </select>
                                )}
                              </td>
                              <td>{member.status}</td>
                              <td>
                                {!member.isOwner && (
                                  <button
                                    className="btn btn-outline-danger btn-sm"
                                    onClick={() => handleRemove(member.User.id)}
                                  >
                                    Remove
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <form onSubmit={handleInvite} className="mb-3">
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="Invite by email"
                          required
                          className="form-control mb-2"
                        />
                        <select
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value)}
                          className="form-select mb-2"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button className="btn btn-primary" type="submit">
                          Invite
                        </button>
                      </form>
                      {teamError && (
                        <div className="alert alert-danger">{teamError}</div>
                      )}
                    </>
                  )}
                </div>
              )}

              {tab === "invitations" && (
                <div>
                  <h5 className="dnsdb-card-title mb-3">Pending Invitations</h5>
                  {inviteLoading ? (
                    <div>Loading invitations...</div>
                  ) : inviteError ? (
                    <div className="alert alert-danger">{inviteError}</div>
                  ) : invites.length === 0 ? (
                    <div>No pending invitations.</div>
                  ) : (
                    <ul className="list-group">
                      {invites.map((invite) => (
                        <li
                          className="list-group-item d-flex justify-content-between align-items-center"
                          key={invite.id}
                        >
                          <span>
                            <b>{invite.domain}</b> &mdash; Role:{" "}
                            <b>{invite.role}</b>
                            {invite.Inviter && (
                              <span className="ms-2 text-muted">
                                (Invited by:{" "}
                                {invite.Inviter.merchant_name ||
                                  invite.Inviter.email}
                                )
                              </span>
                            )}
                          </span>
                          <button
                            className="btn btn-outline-success btn-sm"
                            onClick={() => acceptInvite(invite.domain)}
                          >
                            Accept
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <div className="dnsdb-footer">
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
