const Company = require('../models/Company');

const DEFAULT_COMPANIES = [
  {
    name: 'Swastik Grah Nirman Company',
    shortCode: 'SGNC',
    type: 'Company',
    color: '#2563eb',
  },
  {
    name: 'GLR Real Estate Pvt Ltd',
    shortCode: 'GLR',
    type: 'Private Limited',
    color: '#7c3aed',
  },
  {
    name: 'Neoteric Properties Pvt Ltd',
    shortCode: 'NPL',
    type: 'Private Limited',
    color: '#f37916',
  },
  {
    name: 'Gravity Infrastructure Pvt Ltd',
    shortCode: 'GIPL',
    type: 'Private Limited',
    color: '#0d9488',
  },
  {
    name: 'Reyan Infrastructure Company',
    shortCode: 'RIC',
    type: 'Company',
    color: '#16a85a',
  },
  {
    name: 'Heaven Heights Pvt Ltd',
    shortCode: 'HHL',
    type: 'Private Limited',
    color: '#e03b3b',
  },
  {
    name: 'Neoteric Housing India LLP',
    shortCode: 'NHIL',
    type: 'LLP',
    color: '#0ea5e9',
  },
  {
    name: 'Neoteric Recreational and Hospitality Service Pvt Ltd',
    shortCode: 'NRHS',
    type: 'Private Limited',
    color: '#6366f1',
  },
];

module.exports = async function seedCompanies() {
  try {
    const count = await Company.countDocuments();
    if (count === 0) {
      await Company.insertMany(DEFAULT_COMPANIES);
      console.log('✅  Default companies seeded');
    }
  } catch (err) {
    console.error('Company seed error:', err.message);
  }
};
