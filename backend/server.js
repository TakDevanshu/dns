const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const sequelize = require("./config");
const { User, DNSRecord, Zone, AuditLog, DomainMember } = require("./models");

const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret"; // set JWT_SECRET in env for production
const PORT = process.env.PORT || 5000;

//Database Sync
async function connectWithRetry(retries = 10, delay = 5000) {
  while (retries) {
    try {
      await sequelize.authenticate();
      console.log("Database connected successfully");

      // Avoid performing destructive/complex schema changes automatically in production.
      // In development we allow `alter: true` to ease local changes; otherwise call sync() only.
      if (process.env.NODE_ENV === "development") {
        await sequelize.sync({ alter: true });
        console.log("Database synced (alter)");
      } else {
        await sequelize.sync();
        console.log("Database synced");
      }

      app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
      return;
    } catch (err) {
      // If MySQL reports "Too many keys specified" it's a schema/index issue.
      if (
        err &&
        err.message &&
        err.message.includes("Too many keys specified")
      ) {
        console.error("MySQL Error: Too many keys specified (max 64).");
        console.error(
          "This usually happens when automatic schema alterations add too many indexes/keys."
        );
        console.error("Recommended actions:");
        console.error(
          " - Do NOT use sequelize.sync({ alter: true }) in production"
        );
        console.error(
          " - Inspect your model definitions / migrations and remove redundant indexes"
        );
        console.error(
          " - Use a proper migration to adjust schema instead of automatic sync"
        );
        // exit immediately — retrying won't help until schema is fixed
        process.exit(1);
      }

      retries -= 1;
      console.error(`DB connection failed. Retries left: ${retries}`);
      console.error(err && err.message ? err.message : err);

      if (!retries) {
        console.error("Out of retries. Exiting...");
        process.exit(1);
      }

      console.log(`Retrying in ${delay / 1000}s...`);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
}

connectWithRetry();

// Cors setup
const allowedOrigins = ["http://localhost:5173", "http://172.232.121.87"];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true, // if using cookies or auth headers
  })
);

// Middleware for authentication of token
const verifyToken = (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Expired or invalid token" });
  }
};

// --- Role-based helpers ---

// Check if user is owner or team member (any role)
async function canViewDomain(userId, domain) {
  const zone = await Zone.findOne({ where: { domain } });
  if (zone && zone.userId === userId) return true;
  const member = await DomainMember.findOne({
    where: { userId, domain, status: "active" },
  });
  return !!member;
}

// Check if user is owner or has required team role
async function checkDomainAccess(userId, domain, requiredRole) {
  const zone = await Zone.findOne({ where: { domain } });
  if (zone && zone.userId === userId) return true;
  const member = await DomainMember.findOne({
    where: { userId, domain, status: "active" },
  });
  if (!member) return false;
  const rolePriority = { viewer: 1, editor: 2, admin: 3 };
  return rolePriority[member.role] >= rolePriority[requiredRole];
}

// Get domain owner info
async function getDomainOwner(domain) {
  const zone = await Zone.findOne({ where: { domain } });
  if (!zone) return null;
  return await User.findByPk(zone.userId);
}

// Helper functions
const isValidIPv4 = (ip) => {
  const regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return regex.test(ip);
};

const isValidIPv6 = (ip) => {
  // Covers all standard IPv6 notations, including compressed forms
  return (
    typeof ip === "string" &&
    /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9])?[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9])?[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9])?[0-9]))$/.test(
      ip
    )
  );
};

// Strong Domain Validation - RFC Compliant
const isValidDomain = (domain) => {
  if (typeof domain !== "string") return false;

  // Root symbol (@) allowed for zone apex
  if (domain === "@" || domain.trim() === "") return true;

  // Must contain at least one dot
  const domainRegex =
    /^(?=.{1,253}$)(?!\-)([a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
};

// Enhanced Host/Record Name validation
const isValidRecordName = (name) => {
  if (typeof name !== "string") return false;
  return name === "@" || /^(\*|[a-zA-Z0-9._-]+)$/.test(name);
};

// Enhanced Email validation for SOA (admin contact)
const isValidEmail = (email) => {
  if (typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// Enhanced TTL
const validateTTL = (ttl) => {
  const num = Number(ttl);
  return Number.isInteger(num) && num >= 60 && num <= 86400;
};

// Priority (0-65535)
const validatePriority = (priority) => {
  const num = Number(priority);
  return Number.isInteger(num) && num >= 0 && num <= 65535;
};

// SRV: priority weight port target
const isValidSRV = ({ priority, weight, port, target }) => {
  return (
    validatePriority(priority) &&
    validatePriority(weight) && // same range validation
    Number.isInteger(port) &&
    port > 0 &&
    port <= 65535 &&
    isValidDomain(target)
  );
};

// SOA Validation
const isValidSOA = ({
  primary,
  admin,
  serial,
  refresh,
  retry,
  expire,
  minimum,
}) => {
  // Expect admin to be a normal email (admin@example.com). If you store differently,
  // normalize before calling isValidSOA.
  return (
    isValidDomain(primary) &&
    isValidEmail(admin) &&
    [serial, refresh, retry, expire, minimum].every(
      (n) => Number.isInteger(Number(n)) && Number(n) >= 0
    )
  );
};

// CAA Validation
const isValidCAA = ({ flags, tag, value }) => {
  if (!Number.isInteger(Number(flags)) || flags < 0 || flags > 255)
    return false;
  if (!["issue", "issuewild", "iodef"].includes(tag.toLowerCase()))
    return false;
  return typeof value === "string" && value.length > 0 && value.length <= 255;
};

const isValidTXT = (value) => {
  if (typeof value !== "string") return false;
  if (value.length === 0) return false;

  const parts = value.match(/"[^"]*"|\S+/g);
  if (!parts) return false;
  return parts.every((p) => p.length <= 255);
};

const isValidSRVName = (name) => /^_[a-z0-9-]+\._(tcp|udp)$/i.test(name);

const isValidReversePTR = (value) => {
  const ipv4Reverse = /^(\d{1,3}\.){4}in-addr\.arpa$/i;
  const ipv6Reverse = /^([0-9a-f]\.){32}ip6\.arpa$/i;
  return ipv4Reverse.test(value) || ipv6Reverse.test(value);
};

// Main value validator
const validateRecordValue = (type, value, name = "") => {
  switch (type.toUpperCase()) {
    case "A":
      return isValidIPv4(value);

    case "AAAA":
      return isValidIPv6(value);

    case "CNAME":
      if (name === "@") return false;
      return isValidDomain(value);

    case "NS":
      return isValidDomain(value);

    case "MX":
      return isValidDomain(value);

    case "TXT":
      return (
        typeof value === "string" && value.length > 0 && value.length <= 255
      );

    case "SOA":
      const soaParts = value.trim().split(/\s+/);
      return (
        soaParts.length === 7 &&
        isValidDomain(soaParts[0]) &&
        isValidEmail(soaParts[1].replace(".", "@")) &&
        soaParts.slice(2).every((p) => Number.isInteger(Number(p)))
      );

    case "SRV":
      const srvParts = value.split(/\s+/);
      return (
        srvParts.length === 4 &&
        srvParts.slice(0, 3).every((x) => Number.isInteger(Number(x))) &&
        isValidDomain(srvParts[3])
      );

    case "PTR":
      return isValidDomain(value);

    case "CAA":
      const caaParts = value.split(/\s+/);
      return (
        caaParts.length >= 3 &&
        Number.isInteger(Number(caaParts[0])) &&
        ["issue", "issuewild", "iodef"].includes(caaParts[1].toLowerCase()) &&
        caaParts.slice(2).join(" ").length > 0
      );

    default:
      return true;
  }
};

//api
app.get("/", (req, res) => {
  return res.status(200).json({ message: "Welcome" });
});

app.get("/protected", verifyToken, (req, res) => {
  res.json({ message: "You are authorized!", user: req.user });
});

app.post("/signup", async (req, res) => {
  console.log("------------------SignUp Start------------------");
  const { merchant_name, email, password } = req.body;
  if (!merchant_name || !email || !password) {
    console.log("Parameters Missing");
    return res.status(400).json({ message: "Parameters Missing" });
  }

  try {
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      console.log("Already a User");
      return res.status(400).json({ message: "Already a User" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      merchant_name,
      email,
      password: hashedPassword,
    });

    console.log("User Registered Successfully");

    return res.status(200).json({
      message: "User Registered Successfully",
      id: user.id,
      name: merchant_name,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Server Error", error: err.message });
  }
});

app.post("/login", async (req, res) => {
  console.log("------------------Login Start------------------");
  const { email, password } = req.body;
  if (!email || !password) {
    console.log("Email and Password required");
    return res.status(400).json({ message: "Email and Password required" });
  }

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      console.log("Invalid Credentials");
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log("Invalid Password");
      return res.status(400).json({ message: "Invalid Password" });
    }

    const token = jwt.sign(
      { userID: user.id, is_admin: user.is_admin },
      JWT_SECRET,
      {
        expiresIn: "4h",
      }
    );

    console.log("Login Successful");
    return res.status(200).json({ message: "Login Successful", token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server Error", err: err.message });
  }
});

// Create DNS record (editor/admin)
app.post("/domains/create", verifyToken, async (req, res) => {
  try {
    const {
      domain,
      type,
      name,
      value,
      ttl,
      priority,
      comment,
      userId,
      weight,
      port,
      target,
      primary,
      admin,
      serial,
      refresh,
      retry,
      expire,
      minimum,
      flags,
      tag,
    } = req.body;

    const cleanType = type.toUpperCase();
    const cleanName = name?.toLowerCase();
    const hasAccess = await checkDomainAccess(
      req.user.userID,
      domain,
      "editor"
    );

    if (!req.user.is_admin && !hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have permission to create DNS records for this domain",
      });
    }

    // Ensure zone exists. Use authenticated user as owner when creating a new zone.
    const ownerId = req.user.userID;
    let zone = await Zone.findOne({ where: { domain } });
    if (!zone) {
      zone = await Zone.create({
        domain,
        userId: ownerId,
        status: "active",
        nameServers: ["ns1.yourdns.com", "ns2.yourdns.com", "ns3.yourdns.com"],
      });
    }

    // Required fields
    if (!domain || !cleanType || !cleanName || !userId) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Missing required fields: domain, type, name, userId",
        });
    }

    // Domain format
    if (!isValidDomain(domain)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid domain format" });
    }

    // Valid types
    const validTypes = [
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
    if (!validTypes.includes(cleanType)) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Invalid DNS record type. Supported types: ${validTypes.join(
            ", "
          )}`,
        });
    }

    // Base value validation
    if (["A", "AAAA", "CNAME", "MX", "TXT", "NS", "PTR"].includes(cleanType)) {
      if (!value)
        return res
          .status(400)
          .json({
            success: false,
            message: `Value required for ${cleanType} record`,
          });
      if (!validateRecordValue(cleanType, value, cleanName)) {
        return res
          .status(400)
          .json({
            success: false,
            message: `Invalid value for ${cleanType} record`,
          });
      }
    }

    let recordValue = value;

    // Prevent duplicate record (same type + name + value)
    const duplicate = await DNSRecord.findOne({
      where: {
        domain,
        type: cleanType,
        name: cleanName,
        value: recordValue,
        isActive: true,
      },
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: `Duplicate ${cleanType} record already exists for name '${cleanName}'`,
      });
    }

    // Prevent CNAME conflict
    if (cleanType === "CNAME") {
      const conflict = await DNSRecord.findOne({
        where: { domain, name: cleanName, isActive: true },
      });
      if (conflict) {
        return res.status(409).json({
          success: false,
          message: `CNAME cannot coexist with record type '${conflict.type}' on same name`,
        });
      }
    } else {
      const cnameExists = await DNSRecord.findOne({
        where: { domain, name: cleanName, type: "CNAME", isActive: true },
      });
      if (cnameExists) {
        return res.status(409).json({
          success: false,
          message: `A CNAME already exists for '${cleanName}'. Cannot create '${cleanType}'`,
        });
      }
    }

    // MX cannot point to IP
    if (cleanType === "MX" && (isValidIPv4(value) || isValidIPv6(value))) {
      return res
        .status(400)
        .json({
          success: false,
          message: "MX record value must be a hostname, not an IP",
        });
    }

    // SRV name format _service._tcp
    if (cleanType === "SRV" && !isValidSRVName(cleanName)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "SRV name must follow _service._tcp format",
        });
    }

    // PTR must be reverse naming rule
    if (cleanType === "PTR" && !isValidReversePTR(value)) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "PTR value must follow reverse lookup (in-addr.arpa / ip6.arpa)",
        });
    }

    // SRV handling
    if (cleanType === "SRV") {
      const numPriority = Number(priority);
      const numWeight = Number(weight);
      const numPort = Number(port);

      if ([numPriority, numWeight, numPort].some((v) => isNaN(v)) || !target) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid SRV record parameters" });
      }

      if (
        !isValidSRV({
          priority: numPriority,
          weight: numWeight,
          port: numPort,
          target,
        })
      ) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid SRV specification" });
      }

      recordValue = `${numPriority} ${numWeight} ${numPort} ${target}`;
    }

    // SOA handling
    if (cleanType === "SOA") {
      const numSerial = Number(serial);

      // Serial cannot decrease
      const existingSOA = await DNSRecord.findOne({
        where: { domain, type: "SOA", isActive: true },
      });
      if (existingSOA) {
        const oldSerial = Number(existingSOA.value.split(" ")[2]);
        if (numSerial < oldSerial) {
          return res.status(400).json({
            success: false,
            message: `SOA serial must be >= existing serial (${oldSerial})`,
          });
        }
      }

      recordValue = `${primary} ${admin} ${serial} ${refresh} ${retry} ${expire} ${minimum}`;
    }

    // CAA
    if (cleanType === "CAA") {
      recordValue = `${flags} ${tag} ${value}`;
    }

    // TTL
    if (!validateTTL(ttl)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "TTL must be between 60 and 86400 seconds",
        });
    }

    // MX priority
    if (cleanType === "MX" && !validatePriority(priority)) {
      return res
        .status(400)
        .json({ success: false, message: "Priority required for MX record" });
    }

    // Create record + audit inside a transaction
    const result = await sequelize.transaction(async (tx) => {
      const record = await DNSRecord.create(
        {
          domain,
          type: cleanType,
          name: cleanName,
          value: recordValue,
          ttl: Number(ttl),
          priority: priority ? Number(priority) : null,
          userId: req.user.userID, // ensure creator is the authenticated user
          comment: comment || null,
          isActive: true,
          zoneId: zone.id,
        },
        { transaction: tx }
      );

      await AuditLog.create(
        {
          userId: req.user.userID,
          action: "CREATE",
          entityType: "DNSRecord",
          entityId: record.id,
          domain: record.domain,
          details: record.toJSON(),
          timestamp: new Date(),
        },
        { transaction: tx }
      );

      return record;
    });

    return res
      .status(201)
      .json({
        success: true,
        message: "DNS record created successfully",
        data: result,
      });
  } catch (err) {
    console.error("Error creating DNS record:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create DNS record" });
  }
});

// Get all unique domains for a user (owned or shared, with owner info)
app.get("/domains/user/:userId", verifyToken, async (req, res) => {
  try {
    if (parseInt(req.params.userId) !== req.user.userID && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    // Domains owned by user
    const ownedDomains = await DNSRecord.findAll({
      where: { userId: req.params.userId },
      attributes: [
        [
          DNSRecord.sequelize.fn("DISTINCT", DNSRecord.sequelize.col("domain")),
          "domain",
        ],
      ],
    });

    // Domains shared with user (team access)
    const memberDomains = await DomainMember.findAll({
      where: { userId: req.params.userId, status: "active" },
      attributes: ["domain"],
    });

    // Merge and deduplicate
    const domainSet = new Set([
      ...ownedDomains.map((d) => d.domain || d.get("domain")),
      ...memberDomains.map((m) => m.domain),
    ]);
    const domainList = Array.from(domainSet);

    // Fetch owner info for each domain
    const domainsWithOwner = await Promise.all(
      domainList.map(async (domain) => {
        const owner = await getDomainOwner(domain);
        return {
          domain,
          owner: owner
            ? {
                id: owner.id,
                email: owner.email,
                merchant_name: owner.merchant_name,
              }
            : null,
        };
      })
    );

    return res.json({ success: true, data: { domains: domainsWithOwner } });
  } catch (err) {
    console.error("Fetch user domains error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch user domains" });
  }
});

// Get DNS record statistics (viewer/editor/admin)
app.get("/domains/:domain/stats", verifyToken, async (req, res) => {
  try {
    const canView = await canViewDomain(req.user.userID, req.params.domain);
    if (!canView && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const stats = await DNSRecord.findAll({
      where: { domain: req.params.domain },
      attributes: [
        "type",
        [
          DNSRecord.sequelize.fn("COUNT", DNSRecord.sequelize.col("id")),
          "count",
        ],
      ],
      group: ["type"],
    });

    const totalRecords = await DNSRecord.count({
      where: { domain: req.params.domain },
    });

    const activeRecords = await DNSRecord.count({
      where: { domain: req.params.domain, isActive: true },
    });

    return res.json({
      success: true,
      data: {
        totalRecords,
        activeRecords,
        inactiveRecords: totalRecords - activeRecords,
        recordsByType: stats.reduce((acc, stat) => {
          acc[stat.type] = parseInt(stat.dataValues.count);
          return acc;
        }, {}),
      },
    });
  } catch (err) {
    console.error("Get DNS stats error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch DNS statistics",
      error:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Internal server error",
    });
  }
});

// Get records by domain with advanced filtering (viewer/editor/admin)
app.get("/domains/:domain", verifyToken, async (req, res) => {
  try {
    const canView = await canViewDomain(req.user.userID, req.params.domain);
    if (!canView && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const {
      page = 1,
      limit = 10,
      type,
      name,
      sortBy = "createdAt",
      sortOrder = "DESC",
      isActive,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause
    const whereClause = { domain: req.params.domain };
    if (type) whereClause.type = type.toUpperCase();
    if (name) whereClause.name = { [Op.like]: `%${name}%` };
    if (isActive !== undefined) whereClause.isActive = isActive === "true";

    // Validate sort parameters
    const validSortFields = ["createdAt", "updatedAt", "name", "type", "ttl"];
    const validSortOrders = ["ASC", "DESC"];

    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const safeSortOrder = validSortOrders.includes(sortOrder.toUpperCase())
      ? sortOrder.toUpperCase()
      : "DESC";

    const records = await DNSRecord.findAndCountAll({
      where: whereClause,
      limit: Math.min(parseInt(limit), 100),
      offset,
      order: [[safeSortBy, safeSortOrder]],
      attributes: [
        "id",
        "domain",
        "type",
        "name",
        "value",
        "ttl",
        "priority",
        "comment",
        "isActive",
        "createdAt",
        "updatedAt",
      ],
    });

    return res.json({
      success: true,
      data: {
        records: records.rows,
        pagination: {
          total: records.count,
          page: parseInt(page),
          pages: Math.ceil(records.count / parseInt(limit)),
          limit: parseInt(limit),
        },
      },
    });
  } catch (err) {
    console.error("Fetch DNS records error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch DNS records",
      error:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Internal server error",
    });
  }
});

// Get single DNS record (viewer/editor/admin)
app.get("/domains/:domain/:id", verifyToken, async (req, res) => {
  try {
    const canView = await canViewDomain(req.user.userID, req.params.domain);
    if (!canView && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const record = await DNSRecord.findOne({
      where: { id: req.params.id, domain: req.params.domain },
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "DNS record not found",
      });
    }

    return res.json({
      success: true,
      data: record,
    });
  } catch (err) {
    console.error("Fetch DNS record error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch DNS record",
      error:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Internal server error",
    });
  }
});

// Update record (editor/admin)
app.put("/domains/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      type,
      name,
      value,
      ttl,
      priority,
      comment,
      userId,
      weight,
      port,
      target,
      primary,
      admin,
      serial,
      refresh,
      retry,
      expire,
      minimum,
      flags,
      tag,
    } = req.body;

    // ...access checks...

    if (!type || !name) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Missing required fields: type, name",
        });
    }
    const validTypes = [
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
    if (!validTypes.includes(type.toUpperCase())) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Invalid DNS record type. Supported types: ${validTypes.join(
            ", "
          )}`,
        });
    }
    if (
      ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "PTR"].includes(
        type.toUpperCase()
      )
    ) {
      if (!value)
        return res
          .status(400)
          .json({
            success: false,
            message: `Value required for ${type} record`,
          });
      if (!validateRecordValue(type, value, name))
        return res
          .status(400)
          .json({
            success: false,
            message: `Invalid value for ${type} record`,
          });
    }
    let recordValue = value;
    // SRV validation
    if (type.toUpperCase() === "SRV") {
      const numPriority = Number(priority);
      const numWeight = Number(weight);
      const numPort = Number(port);
      if (
        [numPriority, numWeight, numPort].some(
          (v) => v === undefined || v === "" || isNaN(v)
        ) ||
        !target ||
        target === "" ||
        !isValidSRV({
          priority: numPriority,
          weight: numWeight,
          port: numPort,
          target,
        })
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "SRV record requires numeric priority, weight, port, and valid target",
          });
      }
      recordValue = `${numPriority} ${numWeight} ${numPort} ${target}`;
    }
    // SOA validation
    if (type.toUpperCase() === "SOA") {
      const numSerial = Number(serial);
      const numRefresh = Number(refresh);
      const numRetry = Number(retry);
      const numExpire = Number(expire);
      const numMinimum = Number(minimum);
      if (
        [primary, admin].some((v) => v === undefined || v === "") ||
        [numSerial, numRefresh, numRetry, numExpire, numMinimum].some(
          (v) => v === undefined || v === "" || isNaN(v)
        ) ||
        !isValidSOA({
          primary,
          admin,
          serial: numSerial,
          refresh: numRefresh,
          retry: numRetry,
          expire: numExpire,
          minimum: numMinimum,
        })
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "SOA record requires primary, admin, serial, refresh, retry, expire, minimum",
          });
      }
      recordValue = `${primary} ${admin} ${numSerial} ${numRefresh} ${numRetry} ${numExpire} ${numMinimum}`;
    }
    // CAA validation
    if (type.toUpperCase() === "CAA") {
      const numFlags = Number(flags);
      if (
        [numFlags, tag, value].some(
          (v) =>
            v === undefined || v === "" || (typeof v === "number" && isNaN(v))
        ) ||
        !isValidCAA({ flags: numFlags, tag, value })
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message: "CAA record requires numeric flags, tag, and value",
          });
      }
      recordValue = `${numFlags} ${tag} ${value}`;
    }
    // Validate TTL
    if (!validateTTL(ttl)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "TTL must be between 60 and 86400 seconds",
        });
    }
    // Validate priority for MX
    if (type.toUpperCase() === "MX") {
      if (priority === undefined || !validatePriority(priority)) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Valid priority (0-65535) required for MX records",
          });
      }
    }

    const record = await DNSRecord.findByPk(id);
    if (!record) {
      return res
        .status(404)
        .json({ success: false, message: "Record not found" });
    }

    const oldRecord = record.toJSON();

    await record.update({
      type: type.toUpperCase(),
      name,
      value: recordValue,
      ttl: parseInt(ttl),
      priority: priority ? parseInt(priority) : null,
      comment: comment || null,
      updatedAt: new Date(),
    });

    // Audit log for update
    await AuditLog.create({
      userId: req.user.userID,
      action: "UPDATE",
      entityType: "DNSRecord",
      entityId: record.id,
      domain: record.domain,
      details: { before: oldRecord, after: record.toJSON() },
      timestamp: new Date(),
    });

    return res.json({
      success: true,
      message: "DNS record updated successfully",
      data: record,
    });
  } catch (err) {
    console.error("Update DNS record error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update DNS record",
      error:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Internal server error",
    });
  }
});

// Bulk update records (editor/admin)
app.put("/domains/bulk/:domain", verifyToken, async (req, res) => {
  try {
    const hasAccess = await checkDomainAccess(
      req.user.userID,
      req.params.domain,
      "editor"
    );
    if (!req.user.is_admin && !hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have permission to bulk update DNS records for this domain",
      });
    }

    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Records array is required",
      });
    }

    const results = [];

    for (const recordData of records) {
      try {
        const record = await DNSRecord.findByPk(recordData.id);
        if (record && record.domain === req.params.domain) {
          Object.assign(record, recordData);
          record.updatedAt = new Date();
          await record.save();
          results.push({ id: record.id, success: true });
        } else {
          results.push({
            id: recordData.id,
            success: false,
            error: "Record not found",
          });
        }
      } catch (err) {
        results.push({ id: recordData.id, success: false, error: err.message });
      }
    }

    return res.json({
      success: true,
      message: "Bulk update completed",
      data: results,
    });
  } catch (err) {
    console.error("Bulk update DNS records error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update DNS records",
      error:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Internal server error",
    });
  }
});

// Delete record (editor/admin)
app.delete("/domains/:id", verifyToken, async (req, res) => {
  try {
    const record = await DNSRecord.findByPk(req.params.id);
    if (!record) {
      return res.status(404).json({
        success: false,
        message: "DNS record not found",
      });
    }
    const hasAccess = await checkDomainAccess(
      req.user.userID,
      record.domain,
      "editor"
    );
    if (!req.user.is_admin && !hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have permission to delete DNS records for this domain",
      });
    }

    const deletedRecord = { ...record.toJSON() };
    await record.destroy();

    // Audit log for delete
    await AuditLog.create({
      userId: req.user.userID,
      action: "DELETE",
      entityType: "DNSRecord",
      entityId: deletedRecord.id,
      domain: deletedRecord.domain,
      details: deletedRecord,
      timestamp: new Date(),
    });

    return res.json({
      success: true,
      message: "DNS record deleted successfully",
    });
  } catch (err) {
    console.error("Delete DNS record error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete DNS record",
      error:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Internal server error",
    });
  }
});

// Bulk delete records (editor/admin)
app.delete("/domains/bulk/:domain", verifyToken, async (req, res) => {
  try {
    const hasAccess = await checkDomainAccess(
      req.user.userID,
      req.params.domain,
      "editor"
    );
    if (!req.user.is_admin && !hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have permission to bulk delete DNS records for this domain",
      });
    }

    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Record IDs array is required",
      });
    }

    const recordsToDelete = await DNSRecord.findAll({
      where: { id: { [Op.in]: ids }, domain: req.params.domain },
    });
    for (const rec of recordsToDelete) {
      await AuditLog.create({
        userId: req.user.userID,
        action: "DELETE",
        entityType: "DNSRecord",
        entityId: rec.id,
        domain: rec.domain,
        details: rec.toJSON(),
        timestamp: new Date(),
      });
    }

    const deleted = await DNSRecord.destroy({
      where: {
        id: { [Op.in]: ids },
        domain: req.params.domain,
      },
    });

    return res.json({
      success: true,
      message: `${deleted} DNS records deleted successfully`,
      data: { deletedCount: deleted },
    });
  } catch (err) {
    console.error("Bulk delete DNS records error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete DNS records",
      error:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Internal server error",
    });
  }
});

// Get name servers for a domain (viewer/editor/admin)
app.get("/zones/:domain/nameservers", verifyToken, async (req, res) => {
  try {
    const canView = await canViewDomain(req.user.userID, req.params.domain);
    if (!canView && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const zone = await Zone.findOne({ where: { domain: req.params.domain } });
    if (!zone) {
      return res
        .status(404)
        .json({ success: false, message: "Zone not found" });
    }
    return res.json({ success: true, data: { nameServers: zone.nameServers } });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch name servers" });
  }
});

// Update name servers for a domain (admin only)
// app.put("/zones/:domain/nameservers", verifyToken, async (req, res) => {
//   try {
//     const hasAccess = await checkDomainAccess(req.user.userID, req.params.domain, "admin");
//     if (!req.user.is_admin && !hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "You do not have permission to update name servers for this domain",
//       });
//     }
//     const { nameServers } = req.body;
//     if (!Array.isArray(nameServers) || nameServers.length < 1) {
//       return res.status(400).json({ success: false, message: "Invalid name servers" });
//     }
//     const zone = await Zone.findOne({ where: { domain: req.params.domain } });
//     if (!zone) {
//       return res.status(404).json({ success: false, message: "Zone not found" });
//     }
//     zone.nameServers = nameServers;
//     await zone.save();
//     return res.json({
//       success: true,
//       message: "Name servers updated",
//       data: { nameServers },
//     });
//   } catch (err) {
//     return res.status(500).json({ success: false, message: "Failed to update name servers" });
//   }
// });

// Get zone details for a domain (viewer/editor/admin)
app.get("/zones/:domain", verifyToken, async (req, res) => {
  try {
    const canView = await canViewDomain(req.user.userID, req.params.domain);
    if (!canView && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const zone = await Zone.findOne({ where: { domain: req.params.domain } });
    if (!zone) {
      return res
        .status(404)
        .json({ success: false, message: "Zone not found" });
    }
    return res.json({ success: true, data: zone });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch zone" });
  }
});

// Get audit logs for a domain (viewer/editor/admin)
app.get("/auditlog/:domain", verifyToken, async (req, res) => {
  try {
    const canView = await canViewDomain(req.user.userID, req.params.domain);
    if (!canView && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const logs = await AuditLog.findAll({
      where: { domain: req.params.domain },
      order: [["timestamp", "DESC"]],
      limit: 100,
    });
    res.json({ success: true, data: logs });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch audit logs" });
  }
});

// Invite a team member (admin only)
app.post("/team/invite", verifyToken, async (req, res) => {
  const { domain, email, role } = req.body;
  const hasAccess = await checkDomainAccess(req.user.userID, domain, "admin");
  if (!req.user.is_admin && !hasAccess) {
    return res
      .status(403)
      .json({
        success: false,
        message:
          "You do not have permission to invite team members for this domain",
      });
  }
  if (!domain || !email || !role)
    return res.status(400).json({ success: false, message: "Missing fields" });
  const user = await User.findOne({ where: { email } });
  if (!user)
    return res.status(404).json({ success: false, message: "User not found" });
  const existing = await DomainMember.findOne({
    where: { domain, userId: user.id },
  });
  if (existing)
    return res
      .status(400)
      .json({ success: false, message: "User already a member" });
  await DomainMember.create({
    domain,
    userId: user.id,
    role,
    invitedBy: req.user.userID,
    status: "pending",
  });
  return res.json({ success: true, message: "Invitation sent" });
});

// Get all pending invites for the logged-in user
app.get("/team/invites", verifyToken, async (req, res) => {
  try {
    const invites = await DomainMember.findAll({
      where: { userId: req.user.userID, status: "pending" },
      include: [
        {
          model: User,
          as: "Inviter",
          attributes: ["email", "merchant_name"],
          foreignKey: "invitedBy",
        },
      ],
    });
    res.json({ success: true, data: invites });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch invites" });
  }
});

// Accept invitation
app.post("/team/accept", verifyToken, async (req, res) => {
  const { domain } = req.body;
  const member = await DomainMember.findOne({
    where: { domain, userId: req.user.userID, status: "pending" },
  });
  if (!member)
    return res
      .status(404)
      .json({ success: false, message: "Invitation not found" });
  member.status = "active";
  await member.save();
  return res.json({ success: true, message: "Invitation accepted" });
});

// List team members for a domain (admin only)
app.get("/team/:domain", verifyToken, async (req, res) => {
  const hasAccess = await checkDomainAccess(
    req.user.userID,
    req.params.domain,
    "admin"
  );
  if (!req.user.is_admin && !hasAccess) {
    return res
      .status(403)
      .json({
        success: false,
        message:
          "You do not have permission to view team members for this domain",
      });
  }
  console.log("Fetching members for domain:", req.params.domain);
  const members = await DomainMember.findAll({
    where: { domain: req.params.domain },
    include: [{ model: User, attributes: ["id", "email", "merchant_name"] }],
  });
  console.log("Members found:", members);
  return res.json({ success: true, data: members });
});

// Remove a team member (admin only)
app.delete("/team/:domain/:userId", verifyToken, async (req, res) => {
  const hasAccess = await checkDomainAccess(
    req.user.userID,
    req.params.domain,
    "admin"
  );
  if (!req.user.is_admin && !hasAccess) {
    return res
      .status(403)
      .json({
        success: false,
        message:
          "You do not have permission to remove team members for this domain",
      });
  }
  const { domain, userId } = req.params;
  const member = await DomainMember.findOne({ where: { domain, userId } });
  if (!member)
    return res
      .status(404)
      .json({ success: false, message: "Member not found" });
  await member.destroy();
  return res.json({ success: true, message: "Member removed" });
});

// Change member role (admin only)
app.put("/team/:domain/:userId", verifyToken, async (req, res) => {
  const hasAccess = await checkDomainAccess(
    req.user.userID,
    req.params.domain,
    "admin"
  );
  if (!req.user.is_admin && !hasAccess) {
    return res
      .status(403)
      .json({
        success: false,
        message:
          "You do not have permission to change team member roles for this domain",
      });
  }
  const { domain, userId } = req.params;
  const { role } = req.body;
  const member = await DomainMember.findOne({ where: { domain, userId } });
  if (!member)
    return res
      .status(404)
      .json({ success: false, message: "Member not found" });
  member.role = role;
  await member.save();
  return res.json({ success: true, message: "Role updated" });
});
