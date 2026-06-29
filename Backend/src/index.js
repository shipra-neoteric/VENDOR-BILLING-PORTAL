const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const dotenv  = require('dotenv');

dotenv.config();

const connectDB = require('./config/db');
connectDB();

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());
app.use(morgan('dev'));

// app.get("/",(req,res)=>{
//   res.send("working")
// })

// Routes
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/projects',    require('./routes/projects'));
app.use('/api/contractors', require('./routes/contractors'));
app.use('/api/work-orders', require('./routes/workOrders'));
app.use('/api/bills',       require('./routes/bills'));
app.use('/api/ledger',      require('./routes/ledger'));

// Health check
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// 404
app.use((_req, res) => res.status(404).json({ message: 'Route not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

app.get("/",(req,res)=>{
  res.send("working")
})

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`\n🚀  Server running on http://localhost:${PORT}\n`));
