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
  // Migrate old Shipra account → Admin if it still exists. Guarded against
  // admin@neotericgrp.in already existing (this migration already ran once,
  // successfully, in the past) — without this check, a later-recreated
  // shipra@neotericgrp.in account hits this same rename on every boot and
  // collides with the email's unique index (E11000), which — since nothing
  // upstream in index.js caught it — crashed the entire Node process on
  // every single restart (a boot-time crash-loop, not a one-off failure).
  const oldUser = await User.findOne({ email: 'shipra@neotericgrp.in' }).select('+password');
  if (oldUser) {
    const adminAlreadyExists = await User.findOne({ email: 'admin@neotericgrp.in', _id: { $ne: oldUser._id } });
    if (adminAlreadyExists) {
      console.log('⚠️  Skipped shipra@neotericgrp.in → admin@neotericgrp.in migration — admin@neotericgrp.in already exists');
    } else {
      oldUser.name     = 'Admin';
      oldUser.email    = 'admin@neotericgrp.in';
      oldUser.password = 'Admin@neoteric';
      await oldUser.save();
      console.log('✅  Migrated shipra@neotericgrp.in → admin@neotericgrp.in');
    }
  }

  for (const u of DEFAULT_USERS) {
    const exists = await User.findOne({ email: u.email });
    if (!exists) {
      await User.create(u);
      console.log(`✅  Seeded user: ${u.email} (${u.role})`);
    }
  }
};
