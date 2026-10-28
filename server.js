import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import tasksRouter from "./routes/tasks.js";
import remindersRouter from "./routes/reminders.js";
import { poolConnection } from "./db/index.js";
import { getSmsConfigStatus } from "./services/sms.js";
import { startReminderScheduler } from "./services/scheduler.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static assets from public folder
app.use(express.static(path.join(__dirname, "public")));

// Enhanced health check endpoint reporting DB and safe SMS status
app.get("/api/health", async (req, res) => {
  let dbStatus = "connected";
  try {
    const connection = await poolConnection.getConnection();
    connection.release();
  } catch (err) {
    dbStatus = "disconnected";
  }

  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    database: dbStatus,
    sms: getSmsConfigStatus(),
  });
});

// Tasks and Reminders REST API Routes
app.use("/api/tasks", remindersRouter);
app.use("/api/tasks", tasksRouter);

// 404 Catch-all for API endpoints
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint ${req.method} ${req.originalUrl} not found`,
  });
});

// Catch-all handler: send back index.html for client-side navigation
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Application Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// Verify MySQL connection and launch server
async function startServer() {
  try {
    const connection = await poolConnection.getConnection();
    console.log(" Connected to MySQL database successfully.");
    connection.release();

    app.listen(PORT, () => {
      console.log(` Server is running on http://localhost:${PORT}`);
      // Launch SMS Reminder Scheduler
      startReminderScheduler();
    });
  } catch (error) {
    console.error(" Failed to connect to MySQL database:", error.message);
    console.error("Please verify your .env file credentials and that MySQL is running.");
    process.exit(1);
  }
}

startServer();
