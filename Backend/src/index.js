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
app.use(express.json());
app.use(morgan('dev'));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/public',        require('./routes/public'));   // no auth — public work-order form
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/projects',      require('./routes/projects'));
app.use('/api/contractors',   require('./routes/contractors'));
app.use('/api/categories',    require('./routes/categories'));
app.use('/api/work-orders',   require('./routes/workOrders'));
app.use('/api/bills',         require('./routes/bills'));
app.use('/api/ledger',        require('./routes/ledger'));
app.use('/api/companies',     require('./routes/companies'));
app.use('/api/stages',        require('./routes/stages'));
app.use('/api/activities',    require('./routes/activities'));
app.use('/api/milestones',    require('./routes/milestones'));
app.use('/api/advance-slips',  require('./routes/advanceSlips'));
app.use('/api/bill-requests', require('./routes/billRequests'));
app.use('/api/users',        require('./routes/users'));

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
