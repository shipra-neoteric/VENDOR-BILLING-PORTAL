const express     = require('express');
const cors        = require('cors');
const morgan      = require('morgan');
const compression = require('compression');
const dotenv      = require('dotenv');

dotenv.config();

const connectDB       = require('./config/db');
const seedCategories  = require('./utils/seedCategories');
const seedCompanies   = require('./utils/seedCompanies');
const seedUsers       = require('./utils/seedUsers');
const errorHandler    = require('./middleware/errorMiddleware');

connectDB().then(async () => {
  try {
    const mongoose = require('mongoose');
    await mongoose.connection.collection('categories').dropIndex('name_1');
  } catch (_) { /* index may not exist — ignore */ }
  await seedCategories();
  await seedCompanies();
  await seedUsers();
});

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(compression());
// Slack signs the raw request body, so its routes need the raw bytes captured
// (via `verify`) before the global express.json() below would otherwise
// consume the stream — must be mounted first, with its own parsers. Button
// clicks (interactions) arrive urlencoded; the Events API (DM messages) sends
// plain JSON — both parsers are scoped here so either Content-Type works,
// each only actually parsing (and no-oping otherwise) if it matches.
const slackRawBodyVerify = (req, _res, buf) => { req.rawBody = buf; };
app.use('/api/slack', express.json({ verify: slackRawBodyVerify }));
app.use('/api/slack', express.urlencoded({ extended: true, verify: slackRawBodyVerify }));
app.use('/api/slack', require('./routes/slack'));
app.use(express.json({ limit: '25mb' }));
app.use(morgan('dev'));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/public',        require('./routes/public'));   // no auth — public work-order form
app.use('/api/webhooks',      require('./routes/webhooks')); // no auth — external system callbacks, own shared-secret check
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/projects',      require('./routes/projects'));
app.use('/api/contractors',   require('./routes/contractors'));
app.use('/api/consultants',   require('./routes/consultants'));
app.use('/api/vendor-groups', require('./routes/vendorGroups'));
app.use('/api/categories',    require('./routes/categories'));
app.use('/api/work-orders',   require('./routes/workOrders'));
app.use('/api/quotations',    require('./routes/contractorQuotations'));
app.use('/api/bills',         require('./routes/bills'));
app.use('/api/ledger',        require('./routes/ledger'));
app.use('/api/companies',     require('./routes/companies'));
app.use('/api/stages',        require('./routes/stages'));
app.use('/api/activities',    require('./routes/activities'));
app.use('/api/milestones',    require('./routes/milestones'));
app.use('/api/advance-slips',  require('./routes/advanceSlips'));
app.use('/api/bill-requests', require('./routes/billRequests'));
app.use('/api/users',        require('./routes/users'));
app.use('/api/roles',        require('./routes/roles'));
app.use('/api/workflows',    require('./routes/workflows'));
app.use('/api/dpr',          require('./routes/dpr'));
app.use('/api/report-schedules', require('./routes/reportSchedules'));
app.use('/api/audit-logs',   require('./routes/auditLogs'));
app.use('/api/ai',           require('./routes/ai'));
// Legacy — superseded by /api/daily-progress-reports (the merged form). Kept
// mounted, under a renamed path, so historical submissions stay reachable
// without exposing the old separate forms anywhere in the frontend.
app.use('/api/legacy-daily-project-reports', require('./routes/dailyProjectReports'));
app.use('/api/legacy-daily-labour-reports', require('./routes/dailyLabourReports'));
app.use('/api/daily-progress-reports', require('./routes/dailyProgressReports'));
app.use('/api/drawing-requests', require('./routes/drawingRequests'));
app.use('/api/dri-home',      require('./routes/driHome'));
app.use('/api/uploads',       require('./routes/uploads'));
app.use('/api/backup',        require('./routes/backup'));

app.get('/api/health', (_req, res) =>
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() })
);
app.get('/', (_req, res) => res.send('Nexora ERP API — working'));

app.use((_req, res) =>
  res.status(404).json({ success: false, message: 'Route not found' })
);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`\n🚀  Server running on http://localhost:${PORT}\n`));
