const User = require('../models/User');

const DEFAULT_USERS = [
  {
    name:     'Shipra',
    email:    'shipra@neotericgrp.in',
    password: 'Admin@1234',
    role:     'owner',
  },
  {
    name:     'Site Engineer (DRI)',
    email:    'dri@neotericgrp.in',
    password: 'DRI@1234',
    role:     'dri',
  },
];

module.exports = async function seedUsers() {
  for (const u of DEFAULT_USERS) {
    const exists = await User.findOne({ email: u.email });
    if (!exists) {
      await User.create(u);
      console.log(`✅  Seeded user: ${u.email} (${u.role})`);
    }
  }
};
