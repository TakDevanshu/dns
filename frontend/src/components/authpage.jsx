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
 const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

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
    <div className="auth-page">
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
            --success-green: #28a745;
          }

          .auth-page {
            min-height: 100vh;
            background: linear-gradient(135deg, var(--primary-red), var(--dark-red));
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem 1rem;
          }

          .auth-container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            max-width: 900px;
            width: 100%;
            min-height: 600px;
          }

          .auth-header {
            background: linear-gradient(135deg, var(--primary-red), var(--light-red));
            color: white;
            padding: 3rem 2rem;
            text-align: center;
          }

          .auth-header h1 {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
          }

          .auth-header p {
            font-size: 1.1rem;
            opacity: 0.9;
            margin: 0;
          }

          .auth-body {
            padding: 3rem 2rem;
          }

          .auth-form {
            max-width: 400px;
            margin: 0 auto;
          }

          .form-group {
            margin-bottom: 1.5rem;
          }

          .form-label {
            font-weight: 600;
            color: var(--dark-gray);
            margin-bottom: 0.5rem;
            display: block;
          }

          .form-control {
            border-radius: 12px;
            border: 2px solid #e9ecef;
            padding: 0.875rem 1rem;
            font-size: 1rem;
            transition: all 0.3s ease;
            width: 100%;
          }

          .form-control:focus {
            border-color: var(--primary-red);
            box-shadow: 0 0 0 0.2rem var(--shadow-color);
            outline: none;
          }

          .password-input-wrapper {
            position: relative;
          }

          .password-toggle {
            position: absolute;
            right: 1rem;
            top: 50%;
            transform: translateY(-50%);
            border: none;
            background: none;
            color: var(--medium-gray);
            cursor: pointer;
            padding: 0;
            font-size: 1rem;
          }

          .password-toggle:hover {
            color: var(--primary-red);
          }

          .btn-primary {
            background: var(--primary-red);
            border: none;
            border-radius: 12px;
            padding: 0.875rem 2rem;
            font-weight: 600;
            font-size: 1rem;
            width: 100%;
            transition: all 0.3s ease;
            cursor: pointer;
          }

          .btn-primary:hover {
            background: var(--dark-red);
            transform: translateY(-2px);
            box-shadow: 0 5px 15px var(--shadow-color);
          }

          .btn-primary:disabled {
            background: var(--medium-gray);
            transform: none;
            box-shadow: none;
            cursor: not-allowed;
          }

          .btn-link {
            color: var(--primary-red);
            text-decoration: none;
            font-weight: 600;
            border: none;
            background: none;
            padding: 0;
            cursor: pointer;
            transition: color 0.3s ease;
          }

          .btn-link:hover {
            color: var(--dark-red);
            text-decoration: underline;
          }

          .alert {
            border-radius: 12px;
            margin-bottom: 1.5rem;
            border: none;
            padding: 1rem 1.5rem;
          }

          .alert-danger {
            background: #f8d7da;
            color: #721c24;
          }

          .alert-success {
            background: #d4edda;
            color: #155724;
          }

          .auth-switch {
            text-align: center;
            margin-top: 2rem;
            padding-top: 1.5rem;
            border-top: 1px solid #e9ecef;
          }

          .loading-spinner {
            display: inline-block;
            width: 1rem;
            height: 1rem;
            border: 2px solid transparent;
            border-top: 2px solid currentColor;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 0.5rem;
          }

          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          .brand-logo {
            font-size: 3rem;
            margin-bottom: 1rem;
          }

          @media (max-width: 768px) {
            .auth-container {
              margin: 1rem;
              border-radius: 15px;
            }
            
            .auth-header {
              padding: 2rem 1.5rem;
            }
            
            .auth-header h1 {
              font-size: 2rem;
            }
            
            .auth-body {
              padding: 2rem 1.5rem;
            }
          }
        `}
      </style>

      <div className="auth-container">
        <div className="auth-header">
          <div className="brand-logo">🌐</div>
          <h1>DNS Manager</h1>
          <p>Professional DNS record management system</p>
        </div>

        <div className="auth-body">
          {error && <div className="alert alert-danger">{error}</div>}

          {success && <div className="alert alert-success">{success}</div>}

          <div className="auth-form">
            <h2
              className="text-center mb-4"
              style={{ color: "var(--dark-gray)" }}
            >
              {isLogin ? "Welcome Back" : "Create Account"}
            </h2>

            {isLogin ? (
              <div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="Enter your email"
                    value={loginData.email}
                    onChange={(e) =>
                      setLoginData({ ...loginData, email: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="form-control"
                      placeholder="Enter your password"
                      value={loginData.password}
                      onChange={(e) =>
                        setLoginData({ ...loginData, password: e.target.value })
                      }
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? "👁️" : "👁️‍🗨️"}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={loading}
                  onClick={handleLogin}
                >
                  {loading ? (
                    <>
                      <span className="loading-spinner"></span>
                      Signing In...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </div>
            ) : (
              <div>
                <div className="form-group">
                  <label className="form-label">Merchant Name</label>
                  <input
                    type="text"
                    className="form-control"
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

                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="Enter your email"
                    value={signupData.email}
                    onChange={(e) =>
                      setSignupData({ ...signupData, email: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="form-control"
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
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? "👁️" : "👁️‍🗨️"}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm Password</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="form-control"
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
                  className="btn btn-primary"
                  disabled={loading}
                  onClick={handleSignup}
                >
                  {loading ? (
                    <>
                      <span className="loading-spinner"></span>
                      Creating Account...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </button>
              </div>
            )}

            <div className="auth-switch">
              <p>
                {isLogin
                  ? "Don't have an account? "
                  : "Already have an account? "}
                <button type="button" className="btn-link" onClick={switchMode}>
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
