import React, { useEffect, useState, useCallback } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "./css/dashboard.css";

const DEFAULT_NS_COUNT = 3;

// Helper: get auth token & userId
const getAuthToken = () => localStorage.getItem("authToken");
const getLocalUserId = () => localStorage.getItem("userId");

const Dashboard = ({ onGoToConfig }) => {
  // domain list + selection
  const [domains, setDomains] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState("");

  // UI tabs
  const [tab, setTab] = useState("details");

  // domain/zone details
  const [domainDetails, setDomainDetails] = useState(null);
  const [zoneDetails, setZoneDetails] = useState(null);

  // loading / errors (separate per area)
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [domainError, setDomainError] = useState("");

  // details loading
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  // audit/activity
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");

  // team & invites
  const [team, setTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");

  const [invites, setInvites] = useState([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");

  // invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");

  // small UI flags
  const [globalLoading, setGlobalLoading] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

  // Generic API call util used across the component
  const apiCall = useCallback(
    async (endpoint, options = {}) => {
      const token = getAuthToken();
      const headers = {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      // Attach content-type automatically for bodies unless provided
      if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });
      const contentType = res.headers.get("content-type") || "";
      let data = {};
      if (contentType.includes("application/json")) {
        data = await res.json().catch(() => ({}));
      } else {
        const text = await res.text();
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { message: text || `HTTP error! status: ${res.status}` };
        }
      }
      if (!res.ok) {
        // normalize error
        throw new Error(data?.message || `HTTP error! status: ${res.status}`);
      }
      return data;
    },
    [API_BASE_URL]
  );

  // FETCH DOMAINS (safe: use /domains/user/:id when local user id exists else /domains/me)
  const fetchDomains = useCallback(async (signal) => {
    setLoadingDomains(true);
    setDomainError("");
    try {
      const localId = getLocalUserId();
      const endpoint = localId ? `/domains/user/${localId}` : `/domains/me`;
      const resp = await apiCall(endpoint);
      if (!signal?.aborted) {
        if (resp.success && resp.data?.domains?.length > 0) {
          setDomains(resp.data.domains);
          // only auto-select if nothing selected yet
          setSelectedDomain((prev) => prev || resp.data.domains[0].domain);
        } else {
          setDomains([]);
          setSelectedDomain("");
        }
      }
    } catch (err) {
      if (!signal?.aborted) {
        setDomains([]);
        setSelectedDomain("");
        setDomainError(err.message || "Failed to fetch domains");
      }
    } finally {
      if (!signal?.aborted) setLoadingDomains(false);
    }
  }, [apiCall]);

  useEffect(() => {
    const controller = new AbortController();
    fetchDomains(controller.signal);
    return () => controller.abort();
  }, [fetchDomains]);

  // FETCH DOMAIN DETAILS (records/contacts)
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!selectedDomain) {
        setDomainDetails(null);
        return;
      }
      setLoadingDetails(true);
      setDetailsError("");
      try {
        const resp = await apiCall(`/domains/${selectedDomain}`);
        if (!mounted) return;
        if (resp.success) setDomainDetails(resp.data);
        else setDomainDetails(null);
      } catch (err) {
        if (!mounted) return;
        setDomainDetails(null);
        setDetailsError(err.message || "Failed to fetch domain details");
      } finally {
        if (mounted) setLoadingDetails(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [selectedDomain, apiCall]);

  // FETCH ZONE DETAILS (zone metadata, nameservers)
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!selectedDomain) {
        setZoneDetails(null);
        return;
      }
      try {
        const resp = await apiCall(`/zones/${selectedDomain}`);
        if (!mounted) return;
        if (resp.success && resp.data) setZoneDetails(resp.data);
        else setZoneDetails(null);
      } catch (err) {
        if (!mounted) return;
        setZoneDetails(null);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [selectedDomain, apiCall]);

  // Clear per-tab caches when domain changes to avoid showing old results
  useEffect(() => {
    setAuditLogs([]);
    setTeam([]);
    setInvites([]);
    setAuditError("");
    setTeamError("");
    setInviteError("");
  }, [selectedDomain]);

  // ACTIVITY / AUDIT LOGS (only fetch when user selects Activity tab)
  useEffect(() => {
    let mounted = true;
    if (tab !== "activity" || !selectedDomain) {
      return () => (mounted = false);
    }
    const load = async () => {
      setAuditLoading(true);
      setAuditError("");
      try {
        const data = await apiCall(`/auditlog/${selectedDomain}`);
        if (!mounted) return;
        if (data.success) setAuditLogs(data.data || []);
        else {
          setAuditLogs([]);
          setAuditError(data.message || "Failed to fetch audit logs");
        }
      } catch (err) {
        if (!mounted) return;
        setAuditLogs([]);
        setAuditError(err.message || "Failed to fetch audit logs");
      } finally {
        if (mounted) setAuditLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [tab, selectedDomain, apiCall]);

  // TEAM (fetch only on team tab)
  useEffect(() => {
    let mounted = true;
    if (tab !== "team" || !selectedDomain) {
      return () => (mounted = false);
    }
    const load = async () => {
      setTeamLoading(true);
      setTeamError("");
      try {
        const resp = await apiCall(`/team/${selectedDomain}`);
        if (!mounted) return;
        if (resp.success && resp.data) {
          // Expecting array of memberships with .User
          setTeam(resp.data);
        } else {
          setTeam([]);
        }
      } catch (err) {
        if (!mounted) return;
        setTeam([]);
        setTeamError(err.message || "Failed to fetch team data");
      } finally {
        if (mounted) setTeamLoading(false);
      }
    };
    load();
    return () => (mounted = false);
  }, [tab, selectedDomain, apiCall]);

  // INVITES (fetch only when invitations tab active)
  useEffect(() => {
    let mounted = true;
    if (tab !== "invitations" || !selectedDomain) {
      return () => (mounted = false);
    }
    const load = async () => {
      setInviteLoading(true);
      setInviteError("");
      try {
        // the endpoint earlier used `/team/invites` (global). We keep same.
        const resp = await apiCall(`/team/invites`);
        if (!mounted) return;
        if (resp.success && resp.data) setInvites(resp.data);
        else setInvites([]);
      } catch (err) {
        if (!mounted) return;
        setInvites([]);
        setInviteError(err.message || "Failed to fetch invitations");
      } finally {
        if (mounted) setInviteLoading(false);
      }
    };
    load();
    return () => (mounted = false);
  }, [tab, selectedDomain, apiCall]);

  // CHECK OWNER - use zoneDetails.userId or domainDetails.ownerId where available
  const localUserId = getLocalUserId();
  const isOwner =
    String(zoneDetails?.userId || domainDetails?.ownerId || "") ===
    String(localUserId);

  // TEAM ACTIONS
  const handleRemove = async (removeUserId) => {
    if (!window.confirm("Are you sure you want to remove this team member?"))
      return;
    if (!selectedDomain) return;
    // Prevent removing owner
    if (String(removeUserId) === String(localUserId)) {
      setTeamError("You cannot remove yourself via this action.");
      return;
    }
    try {
      await apiCall(`/team/${selectedDomain}/${removeUserId}`, {
        method: "DELETE",
      });
      // remove from local state by matching User.id where possible
      setTeam((prev) => prev.filter((m) => m.User?.id !== removeUserId));
    } catch (err) {
      setTeamError(err.message || "Failed to remove member");
    }
  };

  const handleChangeRole = async (userIdToChange, newRole) => {
    if (!selectedDomain) return;
    // prevent role change to owner or invalid
    try {
      await apiCall(`/team/${selectedDomain}/${userIdToChange}`, {
        method: "PUT",
        body: JSON.stringify({ role: newRole }),
      });
      setTeam((prev) =>
        prev.map((m) =>
          m.User?.id === userIdToChange ? { ...m, role: newRole } : m
        )
      );
    } catch (err) {
      setTeamError(err.message || "Failed to change role");
    }
  };

  // INVITE
  const handleInvite = async (e) => {
    e.preventDefault();
    if (!selectedDomain) {
      setTeamError("Please select a domain first.");
      return;
    }
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
      // reset and switch to team tab (will fetch team)
      setInviteEmail("");
      setInviteRole("viewer");
      setTab("team");
    } catch (err) {
      setTeamError(err.message || "Failed to send invite");
    }
  };

  const acceptInvite = async (domain) => {
    setInviteError("");
    try {
      const resp = await apiCall(`/team/accept`, {
        method: "POST",
        body: JSON.stringify({ domain }),
      });
      if (resp.success) {
        setInvites((prev) => prev.filter((i) => i.domain !== domain));
      } else {
        setInviteError(resp.message || "Failed to accept invitation.");
      }
    } catch (err) {
      setInviteError(err.message || "Failed to accept invitation.");
    }
  };

  // UTILS: safely render long JSON details truncated with tooltip
  const renderTruncatedJson = (obj, maxChars = 800) => {
    try {
      const str = JSON.stringify(obj, null, 2);
      const truncated = str.length > maxChars ? str.slice(0, maxChars) + "..." : str;
      return <pre title={str} style={{ whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto" }}>{truncated}</pre>;
    } catch {
      return <pre>{String(obj)}</pre>;
    }
  };

  // Domain selector helper: refresh domains (exposed to UI if needed)
  // const refreshDomains = async () => {
  //   setGlobalLoading(true);
  //   try {
  //     await fetchDomains();
  //   } catch {
  //     // fetchDomains sets its own error
  //   } finally {
  //     setGlobalLoading(false);
  //   }
  // };

  // render
  return (
    <div className="dnsdb-wrapper">
      <div className="dnsdb-header">
        <h2 className="dnsdb-title">DNS Dashboard</h2>
      </div>

      {/* Top-level global loading + domain error */}
      {(loadingDomains || globalLoading) && (
        <div className="dnsdb-loading-message">Loading domains...</div>
      )}
      {domainError && <div className="alert alert-danger">{domainError}</div>}

      <div className="dnsdb-domain-selector-container">
        <label htmlFor="domainSelect" className="dnsdb-form-label">
          Select Domain:
        </label>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            id="domainSelect"
            className="dnsdb-form-select"
            value={selectedDomain || ""}
            onChange={(e) => setSelectedDomain(e.target.value)}
            style={{ minWidth: 320 }}
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

          {/* <button
            className="btn btn-outline-primary"
            onClick={() => refreshDomains()}
            title="Refresh domains"
          >
            Refresh
          </button> */}
        </div>
      </div>

      <div className="dnsdb-layout-container">
        {/* Sidebar with tabs */}
        <aside className="dnsdb-sidebar">
          <nav className="dnsdb-nav">
            <button
              className={`dnsdb-nav-link ${tab === "details" ? "dnsdb-nav-link--active" : ""}`}
              onClick={() => setTab("details")}
            >
              Details
            </button>
            <button
              className={`dnsdb-nav-link ${tab === "contacts" ? "dnsdb-nav-link--active" : ""}`}
              onClick={() => setTab("contacts")}
            >
              Contacts
            </button>
            <button
              className={`dnsdb-nav-link ${tab === "nameservers" ? "dnsdb-nav-link--active" : ""}`}
              onClick={() => setTab("nameservers")}
            >
              Name Servers
            </button>
            <button
              className={`dnsdb-nav-link ${tab === "activity" ? "dnsdb-nav-link--active" : ""}`}
              onClick={() => setTab("activity")}
            >
              Activity
            </button>
            <button
              className={`dnsdb-nav-link ${tab === "team" ? "dnsdb-nav-link--active" : ""}`}
              onClick={() => setTab("team")}
            >
              Team
            </button>
            <button
              className={`dnsdb-nav-link ${tab === "invitations" ? "dnsdb-nav-link--active" : ""}`}
              onClick={() => setTab("invitations")}
            >
              Invitations
            </button>
          </nav>
        </aside>

        {/* Main content */}
        <main className="dnsdb-content">
          <div className="dnsdb-card">
            <div className="dnsdb-card-body">
              {/* DETAILS */}
              {tab === "details" && (
                <>
                  {loadingDetails ? (
                    <div className="dnsdb-loading-message">Loading details...</div>
                  ) : detailsError ? (
                    <div className="alert alert-danger">{detailsError}</div>
                  ) : zoneDetails ? (
                    <div>
                      <p><strong>Domain Name:</strong> {zoneDetails.domain}</p>
                      <p>
                        <strong>Domain Created On:</strong>{" "}
                        {zoneDetails.createdAt ? new Date(zoneDetails.createdAt).toLocaleString() : "N/A"}
                      </p>
                      <p><strong>Domain Status:</strong> {zoneDetails.status}</p>
                      <p><strong>Registrar Name:</strong> {zoneDetails.registrarName || "N/A"}</p>
                      <p>
                        <strong>Name Servers:</strong>{" "}
                        {zoneDetails.nameServers?.length ? zoneDetails.nameServers.join(", ") : "N/A"}
                      </p>
                    </div>
                  ) : (
                    <div>No details available.</div>
                  )}
                </>
              )}

              {/* CONTACTS */}
              {tab === "contacts" && (
                <>
                  {loadingDetails ? (
                    <div className="dnsdb-loading-message">Loading contact info...</div>
                  ) : domainDetails?.contacts ? (
                    <div>
                      <p><strong>First Name:</strong> {domainDetails.contacts.firstName || "N/A"}</p>
                      <p><strong>Last Name:</strong> {domainDetails.contacts.lastName || "N/A"}</p>
                      <p><strong>Organization Name:</strong> {domainDetails.contacts.organizationName || "N/A"}</p>
                      <p><strong>Email:</strong> {domainDetails.contacts.email || "N/A"}</p>
                      <p><strong>Phone Number:</strong> {domainDetails.contacts.phoneNumber || "N/A"}</p>
                      <p><strong>Fax Number:</strong> {domainDetails.contacts.faxNumber || "N/A"}</p>
                      <p><strong>Address 1:</strong> {domainDetails.contacts.address1 || "N/A"}</p>
                      <p><strong>Address 2:</strong> {domainDetails.contacts.address2 || "N/A"}</p>
                      <p><strong>City:</strong> {domainDetails.contacts.city || "N/A"}</p>
                      <p><strong>State:</strong> {domainDetails.contacts.state || "N/A"}</p>
                      <p><strong>Zip/Postal Code:</strong> {domainDetails.contacts.zipCode || "N/A"}</p>
                      <p><strong>Country:</strong> {domainDetails.contacts.country || "N/A"}</p>
                    </div>
                  ) : (
                    <div>No contact info available.</div>
                  )}
                </>
              )}

              {/* NAMESERVERS */}
              {tab === "nameservers" && (
                <div>
                  <div className="dnsdb-section-title">Name Servers</div>
                  <ul>
                    {zoneDetails?.nameServers?.length > 0 ? (
                      zoneDetails.nameServers.slice(0, DEFAULT_NS_COUNT).map((ns, idx) => (
                        <li key={idx}>{ns}</li>
                      ))
                    ) : (
                      <li style={{ borderLeft: "4px solid var(--dns-border-light)", background: "var(--dns-bg)", color: "var(--dns-gray)", fontStyle: "italic", padding: "0.5rem 0.75rem" }}>
                        No name servers found.
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* ACTIVITY */}
              {tab === "activity" && (
                <div>
                  <h5 className="dnsdb-section-title">Activity History</h5>
                  {auditLoading ? (
                    <div className="dnsdb-loading-message">Loading activity...</div>
                  ) : auditError ? (
                    <div className="alert alert-danger">{auditError}</div>
                  ) : auditLogs.length === 0 ? (
                    <div className="dnsdb-empty-state">No activity found for this domain.</div>
                  ) : (
                    <div className="dnsdb-activity-table-container">
                      <table className="dnsdb-activity-table">
                        <thead>
                          <tr>
                            <th>When</th>
                            <th>User ID</th>
                            <th>Action</th>
                            <th>Entity</th>
                            <th>Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditLogs.map((log) => (
                            <tr key={log.id || `${log.timestamp}-${log.userId}`}>
                              <td>{log.timestamp ? new Date(log.timestamp).toLocaleString() : ""}</td>
                              <td>{log.userId}</td>
                              <td>{log.action}</td>
                              <td>{log.entityType}</td>
                              <td>{renderTruncatedJson(log.details)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TEAM */}
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
                          {team.map((member) => {
                            const userIdKey = member.User?.id ?? member.id ?? Math.random();
                            return (
                              <tr key={userIdKey}>
                                <td>{member.User?.email ?? "—"}</td>
                                <td>{member.User?.merchant_name ?? "—"}</td>
                                <td>
                                  {member.isOwner ? (
                                    <span className="badge bg-primary">Owner</span>
                                  ) : (
                                    <select
                                      value={member.role}
                                      onChange={(e) => handleChangeRole(member.User.id, e.target.value)}
                                      className="form-select form-select-sm"
                                      style={{ width: 120, display: "inline-block" }}
                                      disabled={!isOwner}
                                      title={!isOwner ? "Only domain owner can change roles" : ""}
                                    >
                                      <option value="viewer">Viewer</option>
                                      <option value="editor">Editor</option>
                                      <option value="admin">Admin</option>
                                    </select>
                                  )}
                                </td>
                                <td>{member.status ?? "active"}</td>
                                <td>
                                  {!member.isOwner && (
                                    <button
                                      className="btn btn-outline-danger btn-sm"
                                      onClick={() => handleRemove(member.User.id)}
                                      disabled={!isOwner}
                                      title={!isOwner ? "Only domain owner can remove members" : ""}
                                    >
                                      Remove
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
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
                        <button className="btn btn-primary" type="submit" disabled={!isOwner}>
                          Invite
                        </button>
                      </form>

                      {teamError && <div className="alert alert-danger">{teamError}</div>}
                    </>
                  )}
                </div>
              )}

              {/* INVITATIONS */}
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
                        <li className="list-group-item d-flex justify-content-between align-items-center" key={invite.id}>
                          <span>
                            <b>{invite.domain}</b> — Role: <b>{invite.role}</b>
                            {invite.Inviter && (
                              <span className="ms-2 text-muted">
                                (Invited by: {invite.Inviter.merchant_name || invite.Inviter.email})
                              </span>
                            )}
                          </span>
                          <button className="btn btn-outline-success btn-sm" onClick={() => acceptInvite(invite.domain)}>
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

      <div className="dnsdb-footer" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={() => onGoToConfig(selectedDomain)}>
          Go to DNS Configuration
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
