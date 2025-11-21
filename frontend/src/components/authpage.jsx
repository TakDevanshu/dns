import React, { useState, useEffect } from "react";
import { jwtDecode } from "jwt-decode";
import "bootstrap/dist/css/bootstrap.min.css";
import "./css/authpage.css";

const AuthPage = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });

  const [signupData, setSignupData] = useState({
    merchant_name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  // API configuration
  const API = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

  const apiCall = async (endpoint, options = {}) => {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        ...options,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || `HTTP error! status: ${response.status}`
        );
      }

      return data;
    } catch (error) {
      console.error("API call error:", error);
      throw error;
    }
  };

  const validateEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const validatePassword = (password) => {
    return password.length >= 6; // Minimum 6 characters
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validation
    if (!loginData.email || !loginData.password) {
      setError("Please fill in all fields");
      setLoading(false);
      return;
    }

    if (!validateEmail(loginData.email)) {
      setError("Please enter a valid email address");
      setLoading(false);
      return;
    }

    try {
      const response = await apiCall("/login", {
        method: "POST",
        body: JSON.stringify(loginData),
      });

      if (response.message === "Login Successful" && response.token) {
        const decoded = jwtDecode(response.token);
        const userId = decoded.userID;
        const isAdmin = decoded.is_admin;

        localStorage.setItem("authToken", response.token);
        localStorage.setItem("userId", userId);
        localStorage.setItem("isAdmin", isAdmin);

        console.log("Decoded token:", decoded);

        setSuccess("Login successful! Redirecting...");

        // Call parent callback if provided
        if (onAuthSuccess) {
          setTimeout(() => {
            onAuthSuccess(response.token);
          }, 1000);
        }
      }
    } catch (error) {
      setError(error.message);
    }

    setLoading(false);
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validation
    if (
      !signupData.merchant_name ||
      !signupData.email ||
      !signupData.password ||
      !signupData.confirmPassword
    ) {
      setError("Please fill in all fields");
      setLoading(false);
      return;
    }

    if (!validateEmail(signupData.email)) {
      setError("Please enter a valid email address");
      setLoading(false);
      return;
    }

    if (!validatePassword(signupData.password)) {
      setError("Password must be at least 6 characters long");
      setLoading(false);
      return;
    }

    if (signupData.password !== signupData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const response = await apiCall("/signup", {
        method: "POST",
        body: JSON.stringify({
          merchant_name: signupData.merchant_name,
          email: signupData.email,
          password: signupData.password,
        }),
      });

      if (response.message === "User Registered Successfully") {
        setSuccess(
          "Registration successful! Please login with your credentials."
        );
        // Clear form
        setSignupData({
          merchant_name: "",
          email: "",
          password: "",
          confirmPassword: "",
        });
        // Switch to login form
        setTimeout(() => {
          setIsLogin(true);
          setSuccess("");
        }, 2000);
      }
    } catch (error) {
      setError(error.message);
    }

    setLoading(false);
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setError("");
    setSuccess("");
    // Clear forms
    setLoginData({ email: "", password: "" });
    setSignupData({
      merchant_name: "",
      email: "",
      password: "",
      confirmPassword: "",
    });
  };

  // Clear messages after 5 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError("");
        setSuccess("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  // Check if already logged in
  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (token) {
      // Verify token is still valid by making a test API call
      apiCall("/protected", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then(() => {
          // Token is valid, notify parent component
          if (onAuthSuccess) {
            onAuthSuccess(token);
          }
        })
        .catch(() => {
          // Token is invalid, remove it
          localStorage.removeItem("authToken");
        });
    }
  }, [onAuthSuccess]);

  return (
    <div className="dns-auth-page">
      <div className="dns-auth-container">
        <div className="dns-auth-header">
          <div className="dns-brand-logo">🌐</div>
          <h1>DNS Manager</h1>
          <p>Professional DNS record management system</p>
        </div>

        <div className="dns-auth-body">
          {error && <div className="dns-alert dns-alert-danger">{error}</div>}

          {success && <div className="dns-alert dns-alert-success">{success}</div>}

          <div className="dns-auth-form">
            <h2
              className="text-center mb-4 welcome"
              style={{ color: "var(--dns-dark-gray)" }}
            >
              {isLogin ? "Welcome Back" : "Create Account"}
            </h2>

            {isLogin ? (
              <div>
                <div className="dns-form-group">
                  <label className="dns-form-label">Email Address</label>
                  <input
                    type="email"
                    className="dns-form-control"
                    placeholder="Enter your email"
                    value={loginData.email}
                    onChange={(e) =>
                      setLoginData({ ...loginData, email: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="dns-form-group">
                  <label className="dns-form-label">Password</label>
                  <div className="dns-password-input-wrapper">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="dns-form-control"
                      placeholder="Enter your password"
                      value={loginData.password}
                      onChange={(e) =>
                        setLoginData({ ...loginData, password: e.target.value })
                      }
                      required
                    />
                    <button
                      type="button"
                      className="dns-password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? "👁️" : "👁️‍🗨️"}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="dns-btn dns-btn-primary"
                  disabled={loading}
                  onClick={handleLogin}
                >
                  {loading ? (
                    <>
                      <span className="dns-loading-spinner"></span>
                      Signing In...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </div>
            ) : (
              <div>
                <div className="dns-form-group">
                  <label className="dns-form-label">Merchant Name</label>
                  <input
                    type="text"
                    className="dns-form-control"
                    placeholder="Enter your business/merchant name"
                    value={signupData.merchant_name}
                    onChange={(e) =>
                      setSignupData({
                        ...signupData,
                        merchant_name: e.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div className="dns-form-group">
                  <label className="dns-form-label">Email Address</label>
                  <input
                    type="email"
                    className="dns-form-control"
                    placeholder="Enter your email"
                    value={signupData.email}
                    onChange={(e) =>
                      setSignupData({ ...signupData, email: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="dns-form-group">
                  <label className="dns-form-label">Password</label>
                  <div className="dns-password-input-wrapper">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="dns-form-control"
                      placeholder="Create a password (min. 6 characters)"
                      value={signupData.password}
                      onChange={(e) =>
                        setSignupData({
                          ...signupData,
                          password: e.target.value,
                        })
                      }
                      required
                    />
                    <button
                      type="button"
                      className="dns-password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? "👁️" : "👁️‍🗨️"}
                    </button>
                  </div>
                </div>

                <div className="dns-form-group">
                  <label className="dns-form-label">Confirm Password</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="dns-form-control"
                    placeholder="Confirm your password"
                    value={signupData.confirmPassword}
                    onChange={(e) =>
                      setSignupData({
                        ...signupData,
                        confirmPassword: e.target.value,
                      })
                    }
                    required
                  />
                </div>

                <button
                  type="button"
                  className="dns-btn dns-btn-primary"
                  disabled={loading}
                  onClick={handleSignup}
                >
                  {loading ? (
                    <>
                      <span className="dns-loading-spinner"></span>
                      Creating Account...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </button>
              </div>
            )}

            <div className="dns-auth-switch">
              <p>
                {isLogin
                  ? "Don't have an account? "
                  : "Already have an account? "}
                <button type="button" className="dns-btn-link" onClick={switchMode}>
                  {isLogin ? "Sign Up" : "Sign In"}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;