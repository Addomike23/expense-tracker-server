require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const connectDB = require("./config/connectDB");

// Import Routes
const authRouter = require("./routes/auth");
const transactionRouter = require("./routes/transactions");
const dashboardRouter = require("./routes/dashboard");
const budgetRouter = require("./routes/budgets");
const categoryRouter = require("./routes/categories");
const predictionRouter = require("./routes/predictions");
const anomalyRouter = require("./routes/anomalies");

const app = express();
const PORT = process.env.PORT || 5000;

/* =======================
   Middleware
======================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());

/* =======================
   CORS Configuration
======================= */
const allowedOrigins = [
    "https://expense-tracker-frontend-theta-one.vercel.app/",
    "http://localhost:5173",
    
];

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) return callback(null, true);
            return callback(new Error("Not allowed by CORS"));
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
        allowedHeaders: ["Content-Type", "Authorization"]
    })
);

/* =======================
   Routes
======================= */

// Root route
app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "AI Expense Tracker API is running",
        version: "1.0.0",
        endpoints: {
            auth: "/api/auth",
            transactions: "/api/transactions",
            dashboard: "/api/dashboard",
            budgets: "/api/budgets",
            categories: "/api/categories",
            predictions: "/api/predictions",
            anomalies: "/api/anomalies",
            health: "/api/health"
        }
    });
});

// Health check route
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        services: {
            database: "connected",
            ml_anomaly: "active",
            ml_prediction: "active"
        }
    });
});

/* =======================
   API Routers
======================= */
app.use("/auth", authRouter);
app.use("/transactions", transactionRouter);
app.use("/dashboard", dashboardRouter);
app.use("/budgets", budgetRouter);
app.use("/categories", categoryRouter);
app.use("/predictions", predictionRouter);
app.use("/anomalies", anomalyRouter);

/* =======================
   Error Handling Middleware
======================= */
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`
    });
});

app.use((err, req, res, next) => {
    console.error("Global error:", err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal server error",
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

/* =======================
   Connect to MongoDB & Start Server
======================= */
connectDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`
╔══════════════════════════════════════════════════════╗
║     💰 AI EXPENSE TRACKER - BACKEND SERVER 📊        ║
╠══════════════════════════════════════════════════════╣
║  Server: http://localhost:${PORT}                      ║
║  Environment: ${process.env.NODE_ENV || 'development'}                    ║
╠══════════════════════════════════════════════════════╣
║  📍 API Endpoints:                                   ║
║  • Auth:         /api/auth                          ║
║  • Transactions: /api/transactions                  ║
║  • Dashboard:    /api/dashboard                     ║
║  • Budgets:      /api/budgets                       ║
║  • Categories:   /api/categories                    ║
║  • Predictions:  /api/predictions                   ║
║  • Anomalies:    /api/anomalies                     ║
╠══════════════════════════════════════════════════════╣
║  🤖 ML Features:                                     ║
║  • Anomaly Detection (Z-Score & IQR)                ║
║  • Predictive Budgeting (Linear Regression)         ║
║  • Spending Forecasts                               ║
║  • Budget Recommendations                           ║
╚══════════════════════════════════════════════════════╝
            `);
        });
    })
    .catch((err) => {
        console.error("❌ Failed to connect to MongoDB:", err.message);
        process.exit(1);
    });

/* =======================
   Export App for Vercel
======================= */
module.exports = app;