const User = require('../models/User');

const DEFAULT_USERS = [
  {
    name:     'Admin',
    email:    'admin@neotericgrp.in',
    password: 'Admin@neoteric',
    role:     'owner',
  },
  {
    name:     'Site DRI',
    email:    'dri@neotericgrp.in',
    password: 'DRI@1234',
    role:     'site-dri',
  },
];

module.exports = async function seedUsers() {
  // Migrate old Shipra account → Admin if it still exists
  const oldUser = await User.findOne({ email: 'shipra@neotericgrp.in' }).select('+password');
  if (oldUser) {
    oldUser.name     = 'Admin';
    oldUser.email    = 'admin@neotericgrp.in';
    oldUser.password = 'Admin@neoteric';
    await oldUser.save();
    console.log('✅  Migrated shipra@neotericgrp.in → admin@neotericgrp.in');
  }

  for (const u of DEFAULT_USERS) {
    const exists = await User.findOne({ email: u.email });
    if (!exists) {
      await User.create(u);
      console.log(`✅  Seeded user: ${u.email} (${u.role})`);
    }
  }
};
